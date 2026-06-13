import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSlideDeckDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}
