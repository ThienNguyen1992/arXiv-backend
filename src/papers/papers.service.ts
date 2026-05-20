import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';
import { CreatePaperVersionDto } from './dto/create-paper-version.dto';
import { AddPaperTopicDto } from './dto/add-paper-topic.dto';
import { AddPaperAuthorDto } from './dto/add-paper-author.dto';
import { Paper } from './entities/paper.entity';
import { PaperVersion } from './entities/paper-version.entity';
import { PaperTopic } from './entities/paper-topic.entity';
import { PaperAuthor } from './entities/paper-author.entity';

@Injectable()
export class PapersService {
  constructor(
    @InjectRepository(Paper)
    private readonly papersRepository: Repository<Paper>,
    @InjectRepository(PaperVersion)
    private readonly versionsRepository: Repository<PaperVersion>,
    @InjectRepository(PaperTopic)
    private readonly paperTopicsRepository: Repository<PaperTopic>,
    @InjectRepository(PaperAuthor)
    private readonly paperAuthorsRepository: Repository<PaperAuthor>,
  ) {}

  create(createPaperDto: CreatePaperDto) {
    const paper = this.papersRepository.create(createPaperDto);
    return this.papersRepository.save(paper);
  }

  findAll() {
    return this.papersRepository.find({
      relations: ['paperTopics', 'paperTopics.topic', 'paperAuthors', 'paperAuthors.author', 'versions'],
    });
  }

  async findOne(id: string) {
    const paper = await this.papersRepository.findOne({
      where: { id },
      relations: ['paperTopics', 'paperTopics.topic', 'paperAuthors', 'paperAuthors.author', 'versions'],
    });
    if (!paper) throw new NotFoundException(`Paper #${id} not found`);
    return paper;
  }

  async update(id: string, updatePaperDto: UpdatePaperDto) {
    const paper = await this.findOne(id);
    this.papersRepository.merge(paper, updatePaperDto);
    return this.papersRepository.save(paper);
  }

  async remove(id: string) {
    const paper = await this.findOne(id);
    return this.papersRepository.remove(paper);
  }

  // --- Versions ---
  async addVersion(paperId: string, dto: CreatePaperVersionDto) {
    await this.findOne(paperId); // ensure paper exists
    const version = this.versionsRepository.create({ ...dto, article_id: paperId });
    return this.versionsRepository.save(version);
  }

  async getVersions(paperId: string) {
    await this.findOne(paperId);
    return this.versionsRepository.find({ where: { article_id: paperId }, order: { version_number: 'ASC' } });
  }

  // --- Topics ---
  async addTopic(paperId: string, dto: AddPaperTopicDto) {
    await this.findOne(paperId);
    const paperTopic = this.paperTopicsRepository.create({ article_id: paperId, ...dto });
    return this.paperTopicsRepository.save(paperTopic);
  }

  async removeTopic(paperId: string, topicId: number) {
    const pt = await this.paperTopicsRepository.findOneBy({ article_id: paperId, topic_id: topicId });
    if (!pt) throw new NotFoundException(`Topic #${topicId} not linked to Paper #${paperId}`);
    return this.paperTopicsRepository.remove(pt);
  }

  // --- Authors ---
  async addAuthor(paperId: string, dto: AddPaperAuthorDto) {
    await this.findOne(paperId);
    const paperAuthor = this.paperAuthorsRepository.create({ article_id: paperId, ...dto });
    return this.paperAuthorsRepository.save(paperAuthor);
  }

  async removeAuthor(paperId: string, authorId: number) {
    const pa = await this.paperAuthorsRepository.findOneBy({ article_id: paperId, author_id: authorId });
    if (!pa) throw new NotFoundException(`Author #${authorId} not linked to Paper #${paperId}`);
    return this.paperAuthorsRepository.remove(pa);
  }
}
