import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paper } from './entities/paper.entity';
import { CreatePaperDto } from './dto/create-paper.dto';
import { UpdatePaperDto } from './dto/update-paper.dto';

@Injectable()
export class PapersService {
  constructor(
    @InjectRepository(Paper)
    private readonly papersRepository: Repository<Paper>,
  ) {}

  async create(createPaperDto: CreatePaperDto): Promise<Paper> {
    const paper = this.papersRepository.create(createPaperDto);
    return await this.papersRepository.save(paper);
  }

  async findAll(): Promise<Paper[]> {
    return await this.papersRepository.find({ relations: ['topics'] });
  }

  async findOne(id: string): Promise<Paper> {
    const paper = await this.papersRepository.findOne({ where: { id }, relations: ['topics'] });
    if (!paper) {
      throw new NotFoundException(`Paper #${id} not found`);
    }
    return paper;
  }

  async update(id: string, updatePaperDto: UpdatePaperDto): Promise<Paper> {
    const paper = await this.findOne(id);
    this.papersRepository.merge(paper, updatePaperDto);
    return await this.papersRepository.save(paper);
  }

  async remove(id: string): Promise<void> {
    const paper = await this.findOne(id);
    await this.papersRepository.remove(paper);
  }
}
