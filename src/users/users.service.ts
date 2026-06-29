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
import { CategoriesService } from '../categories/categories.service';
import { UserTopicsQueryDto } from './dto/user-topics-query.dto';
import { resolveArxivTopicCode } from '../common/utils/arxiv-taxonomy.util';
import { UserPaperHistory } from './entities/user-paper-history.entity';
import { UserFavorite } from './entities/user-favorite.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Topic)
    private readonly topicsRepository: Repository<Topic>,
    private readonly categoriesService: CategoriesService,
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

  async getMe(userId: string) {
    const user = await this.findOne(userId);
    delete (user as Partial<User>).password;
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

  async getTopics(userId: string, query: UserTopicsQueryDto = new UserTopicsQueryDto()) {
    const user = await this.findOne(userId);
    const topics = [...(user.topics ?? [])].sort((first, second) => first.code.localeCompare(second.code));

    if (query.all) {
      return toPaginatedResponse(topics, topics.length, 1, topics.length || 1);
    }

    const { page, size, skip, take } = getPagination(query);
    const data = topics.slice(skip, skip + take);

    return toPaginatedResponse(data, topics.length, page, size);
  }

  async setTopics(userId: string, topicCodes: string[]) {
    const user = await this.findOne(userId);
    const normalizedCodes = this.normalizeTopicCodes(topicCodes);

    if (normalizedCodes.length > 0) {
      await this.categoriesService.ensureTopicsForCodes(normalizedCodes);
    }

    const topics = await this.findTopicsByCodesOrFail(normalizedCodes);

    user.topics = topics;
    user.isFirstLogged = false;
    await this.usersRepository.save(user);

    return this.getTopics(userId, Object.assign(new UserTopicsQueryDto(), { all: true }));
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

    return this.getTopics(userId, Object.assign(new UserTopicsQueryDto(), { all: true }));
  }

  async removeTopic(userId: string, topicId: number) {
    const user = await this.findOne(userId);
    user.topics = (user.topics ?? []).filter((topic) => topic.id !== topicId);
    await this.usersRepository.save(user);

    return this.getTopics(userId, Object.assign(new UserTopicsQueryDto(), { all: true }));
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
    const normalizedArxivId = this.normalizeArxivId(arxivId);
    await this.findOne(userId);

    const existing = await this.favoriteRepository.findOne({
      where: { user_id: userId, arxiv_id: normalizedArxivId },
    });

    if (!existing) {
      const favorite = this.favoriteRepository.create({
        user_id: userId,
        arxiv_id: normalizedArxivId,
      });
      await this.favoriteRepository.save(favorite);
    }

    return this.getFavorites(userId, new PaginationQueryDto());
  }

  async removeFavorite(userId: string, arxivId: string) {
    const normalizedArxivId = this.normalizeArxivId(arxivId);
    await this.findOne(userId);

    const favorite = await this.favoriteRepository.findOne({
      where: { user_id: userId, arxiv_id: normalizedArxivId },
    });

    if (favorite) {
      await this.favoriteRepository.remove(favorite);
    }

    return this.getFavorites(userId, new PaginationQueryDto());
  }

  // --- Reading History (stored as arxiv_id, data fetched from Elasticsearch) ---

  async getHistory(userId: string, query: PaginationQueryDto) {
    const { page, size, skip, take } = getPagination(query);

    const [history, total] = await this.historyRepository.findAndCount({
      where: { user_id: userId },
      order: { viewed_at: 'DESC' },
      skip,
      take,
    });

    const arxivIds = history.map((entry) => entry.arxiv_id);
    const papers = await this.papersService.getElasticsearchPapersByArxivIds(arxivIds);
    const paperMap = new Map(papers.map((paper) => [paper.arxiv_id, paper]));

    const data = history.map((entry) => {
      const paper = paperMap.get(entry.arxiv_id);
      if (paper) {
        return { ...paper, viewed_at: entry.viewed_at };
      }

      return {
        arxiv_id: entry.arxiv_id,
        viewed_at: entry.viewed_at,
      };
    });

    return toPaginatedResponse(data, total, page, size);
  }

  async addHistory(userId: string, arxivId: string) {
    const normalizedArxivId = this.normalizeArxivId(arxivId);
    await this.findOne(userId);

    let historyEntry = await this.historyRepository.findOne({
      where: { user_id: userId, arxiv_id: normalizedArxivId },
    });

    if (historyEntry) {
      historyEntry.viewed_at = new Date();
    } else {
      historyEntry = this.historyRepository.create({
        user_id: userId,
        arxiv_id: normalizedArxivId,
        viewed_at: new Date(),
      });
    }

    await this.historyRepository.save(historyEntry);

    return this.getHistory(userId, new PaginationQueryDto());
  }

  private normalizeArxivId(value: string): string {
    return value.trim().replace(/v\d+$/i, '');
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

  private normalizeTopicCodes(topicCodes: string[]): string[] {
    return [
      ...new Set(
        topicCodes
          .map((code) => resolveArxivTopicCode(code.trim()).code)
          .filter(Boolean),
      ),
    ];
  }

  private async findTopicsByCodesOrFail(topicCodes: string[]): Promise<Topic[]> {
    if (topicCodes.length === 0) {
      return [];
    }

    const lowerCodes = topicCodes.map((code) => code.toLowerCase());
    const topics = await this.topicsRepository
      .createQueryBuilder('topic')
      .leftJoinAndSelect('topic.category', 'category')
      .where('LOWER(topic.code) IN (:...lowerCodes)', { lowerCodes })
      .getMany();

    const foundCodes = new Set(topics.map((topic) => topic.code.toLowerCase()));
    const missingCodes = topicCodes.filter((code) => !foundCodes.has(code.toLowerCase()));

    if (missingCodes.length > 0) {
      throw new NotFoundException(`Topics not found: ${missingCodes.join(', ')}`);
    }

    return topics;
  }
}
