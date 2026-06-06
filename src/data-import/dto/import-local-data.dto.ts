import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ImportLocalDataDto {
  @ApiProperty({
    description: 'The absolute local path to the JSON file',
    example: 'C:/downloads/note.json',
  })
  @IsString()
  @IsNotEmpty()
  path: string;
}
