import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { getPagination, toPaginatedResponse } from '../common/pagination';
import { PapersService } from '../papers/papers.service';
import { Topic } from '../topics/entities/topic.entity';
import { UserPaperHistory } from './entities/user-paper-history.entity';
import { UserFavorite } from './entities/user-favorite.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Topic)
    private readonly topicsRepository: Repository<Topic>,
    @InjectRepository(UserPaperHistory)
    private readonly historyRepository: Repository<UserPaperHistory>,
    @InjectRepository(UserFavorite)
    private readonly favoriteRepository: Repository<UserFavorite>,
    private readonly papersService: PapersService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    return await this.usersRepository.save(user);
  }

  async findByEmail(email: string, withTopics = false): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { email },
      relations: withTopics ? ['topics', 'topics.category'] : [],
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { page, size, skip, take } = getPagination(query);
    const [data, total] = await this.usersRepository.findAndCount({
      relations: ['topics', 'topics.category'],
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    return toPaginatedResponse(data, total, page, size);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['topics', 'topics.category'],
    });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    this.usersRepository.merge(user, updateUserDto);
    return await this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  async getTopics(userId: string, query: PaginationQueryDto) {
    const user = await this.findOne(userId);
    const { page, size, skip, take } = getPagination(query);
    const topics = [...(user.topics ?? [])].sort((first, second) => first.code.localeCompare(second.code));
    const data = topics.slice(skip, skip + take);

    return toPaginatedResponse(data, topics.length, page, size);
  }

  async setTopics(userId: string, topicCodes: string[]) {
    const user = await this.findOne(userId);
    const topics = await this.findTopicsByCodesOrFail(topicCodes);

    user.topics = topics;
    user.isFirstLogged = false;
    await this.usersRepository.save(user);

    return topics;
  }

  async addTopic(userId: string, topicId: number) {
    const user = await this.findOne(userId);
    const topic = await this.topicsRepository.findOne({
      where: { id: topicId },
      relations: ['category'],
    });

    if (!topic) {
      throw new NotFoundException(`Topic #${topicId} not found`);
    }

    const topics = user.topics ?? [];
    if (!topics.some((existingTopic) => existingTopic.id === topic.id)) {
      user.topics = [...topics, topic];
      await this.usersRepository.save(user);
    }

    return this.getTopics(userId, new PaginationQueryDto());
  }

  async removeTopic(userId: string, topicId: number) {
    const user = await this.findOne(userId);
    user.topics = (user.topics ?? []).filter((topic) => topic.id !== topicId);
    await this.usersRepository.save(user);

    return this.getTopics(userId, new PaginationQueryDto());
  }

  // --- Favorite Papers (stored as arxiv_id, data fetched from Elasticsearch) ---

  async getFavorites(userId: string, query: PaginationQueryDto) {
    const { page, size, skip, take } = getPagination(query);

    const [favorites, total] = await this.favoriteRepository.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    const arxivIds = favorites.map(f => f.arxiv_id);
    const data = await this.papersService.getElasticsearchPapersByArxivIds(arxivIds);

    return toPaginatedResponse(data, total, page, size);
  }

  async addFavorite(userId: string, arxivId: string) {
    // Ensure user exists
    await this.findOne(userId);

    // Upsert: ignore duplicate (unique constraint on user_id + arxiv_id)
    const existing = await this.favoriteRepository.findOne({
      where: { user_id: userId, arxiv_id: arxivId },
    });

    if (!existing) {
      const favorite = this.favoriteRepository.create({ user_id: userId, arxiv_id: arxivId });
      await this.favoriteRepository.save(favorite);
    }

    return this.getFavorites(userId, new PaginationQueryDto());
  }

  async removeFavorite(userId: string, arxivId: string) {
    await this.findOne(userId);

    const favorite = await this.favoriteRepository.findOne({
      where: { user_id: userId, arxiv_id: arxivId },
    });

    if (favorite) {
      await this.favoriteRepository.remove(favorite);
    }

    return this.getFavorites(userId, new PaginationQueryDto());
  }

  // --- Reading History (stored as arxiv_id, data fetched from Elasticsearch) ---

  async getHistory(userId: string, query: PaginationQueryDto) {
    const { page, size, skip, take } = getPagination(query);

    // 1. Fetch paginated history from Postgres to preserve exact viewed_at order
    const [history, total] = await this.historyRepository.findAndCount({
      where: { user_id: userId },
      order: { viewed_at: 'DESC' },
      skip,
      take,
    });

    const arxivIds = history.map(h => h.arxiv_id);
    const data = await this.papersService.getElasticsearchPapersByArxivIds(arxivIds);

    return toPaginatedResponse(data, total, page, size);
  }

  async addHistory(userId: string, arxivId: string) {
    await this.findOne(userId);

    let historyEntry = await this.historyRepository.findOne({
      where: { user_id: userId, arxiv_id: arxivId },
    });

    if (historyEntry) {
      // Update timestamp to mark as re-visited
      historyEntry.viewed_at = new Date();
    } else {
      historyEntry = this.historyRepository.create({
        user_id: userId,
        arxiv_id: arxivId,
      });
    }

    await this.historyRepository.save(historyEntry);

    return this.getHistory(userId, new PaginationQueryDto());
  }

  private async findTopicsOrFail(topicIds: number[]): Promise<Topic[]> {
    if (topicIds.length === 0) {
      return [];
    }

    const topics = await this.topicsRepository.find({
      where: { id: In(topicIds) },
      relations: ['category'],
    });

    const foundIds = new Set(topics.map((topic) => topic.id));
    const missingIds = topicIds.filter((topicId) => !foundIds.has(topicId));

    if (missingIds.length > 0) {
      throw new NotFoundException(`Topics not found: ${missingIds.join(', ')}`);
    }

    return topics;
  }

  private async findTopicsByCodesOrFail(topicCodes: string[]): Promise<Topic[]> {
    if (topicCodes.length === 0) {
      return [];
    }

    const topics = await this.topicsRepository.find({
      where: { code: In(topicCodes) },
      relations: ['category'],
    });

    const foundCodes = new Set(topics.map((topic) => topic.code));
    const missingCodes = topicCodes.filter((code) => !foundCodes.has(code));

    if (missingCodes.length > 0) {
      throw new NotFoundException(`Topics not found: ${missingCodes.join(', ')}`);
    }

    return topics;
  }
}
