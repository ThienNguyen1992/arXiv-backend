import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEmail } from 'class-validator';

export class CreateAuthorDto {
  @ApiProperty({ example: 'John Doe', description: 'Full name of the author' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @ApiPropertyOptional({ example: 'john@example.com', description: 'Email address' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: 'Dai hoc Bach Khoa', description: 'University or research institute' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  affiliation?: string;

  @ApiPropertyOptional({ example: '0000-0001-2345-6789', description: 'ORCID identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  orcid?: string;
}
