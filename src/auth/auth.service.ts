import { Injectable, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto, ForgotPasswordDto, ResetPasswordDto, LoginResponseDto } from './dto/auth.dto';
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
    if (user && await bcrypt.compare(pass, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  private async getTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET || 'secretKey',
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'refreshSecretKey',
        expiresIn: '7d',
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900, // 15 minutes in seconds
    };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const salt = await bcrypt.genSalt();
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);
    await this.usersRepository.update(userId, {
      hashed_refresh_token: hashedRefreshToken,
    });
  }

  async login(user: any): Promise<LoginResponseDto> {
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    // Fetch fresh user object without password to return
    const fullUser = await this.usersRepository.findOne({ where: { id: user.id } });
    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }
    
    return {
      user: fullUser,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    };
  }

  async logout(userId: string) {
    await this.usersRepository.update(userId, {
      hashed_refresh_token: null,
    });
    return { message: 'Successfully logged out.' };
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user || !user.hashed_refresh_token) {
      throw new ForbiddenException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(refreshToken, user.hashed_refresh_token);
    if (!refreshTokenMatches) {
      throw new ForbiddenException('Access Denied');
    }

    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refresh_token);

    return {
      user,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }
    return this.usersService.create(registerDto);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordExpires = new Date();
    resetPasswordExpires.setHours(resetPasswordExpires.getHours() + 1); // 1 hour expiration

    user.reset_password_token = resetToken;
    user.reset_password_expires = resetPasswordExpires;
    await this.usersRepository.save(user);

    console.log(`Password reset link: http://localhost:3000/auth/reset-password?token=${resetToken}`);

    return { message: 'Password reset email sent' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.usersRepository.findOne({ 
      where: { reset_password_token: resetPasswordDto.token } 
    });

    if (!user || !user.reset_password_expires || user.reset_password_expires < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, salt);

    user.password = hashedPassword;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    
    await this.usersRepository.save(user);

    return { message: 'Password has been successfully reset' };
  }
}
