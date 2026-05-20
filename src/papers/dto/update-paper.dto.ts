import { PartialType } from '@nestjs/swagger';
import { CreatePaperDto } from './create-paper.dto';

export class UpdatePaperDto extends PartialType(CreatePaperDto) {}
