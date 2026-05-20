import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { Topic } from './entities/topic.entity';

@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic)
    private topicsRepository: Repository<Topic>,
  ) {}

  create(createTopicDto: CreateTopicDto) {
    const topic = this.topicsRepository.create(createTopicDto);
    return this.topicsRepository.save(topic);
  }

  findAll() {
    return this.topicsRepository.find({ relations: ['category'] });
  }

  async findOne(id: number) {
    const topic = await this.topicsRepository.findOne({ where: { id }, relations: ['category'] });
    if (!topic) throw new NotFoundException(`Topic #${id} not found`);
    return topic;
  }

  async update(id: number, updateTopicDto: UpdateTopicDto) {
    const topic = await this.findOne(id);
    this.topicsRepository.merge(topic, updateTopicDto);
    return this.topicsRepository.save(topic);
  }

  async remove(id: number) {
    const topic = await this.findOne(id);
    return this.topicsRepository.remove(topic);
  }
}
