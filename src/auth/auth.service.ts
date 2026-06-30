import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginResponseDto } from './dto/auth.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  private async getAccessToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'secretKey',
      expiresIn: '1d',
    });

    return {
      access_token: accessToken,
      expires_in: 86400,
    };
  }

  async login(user: any): Promise<LoginResponseDto> {
    const tokens = await this.getAccessToken(user.id, user.email);

    const fullUser = await this.usersRepository.findOne({
      where: { id: user.id },
      relations: ['topics', 'topics.category'],
    });
    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }
    delete (fullUser as Partial<User>).password;

    return {
      user: fullUser,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    };
  }

  async logout() {
    return { message: 'Successfully logged out.' };
  }

  async getProfile(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['topics', 'topics.category'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    delete (user as Partial<User>).password;
    return user;
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }
    return this.usersService.create(registerDto);
  }
}
