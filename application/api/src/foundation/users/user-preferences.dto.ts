import { IsIn } from 'class-validator';

export const appearanceThemes = ['light', 'dark', 'system'] as const;
export const appearanceAccents = ['red', 'green', 'blue', 'teal', 'purple', 'orange', 'pink'] as const;
export const appearanceTitleSizes = ['small', 'default', 'large'] as const;
export const appearanceHeaderSizes = ['small', 'default', 'large'] as const;
export const appearanceBodySizes = ['compact', 'default', 'large'] as const;
export const appearanceDensities = ['compact', 'comfortable', 'spacious'] as const;

export class UpdateUserPreferencesDto {
  @IsIn(appearanceThemes)
  themeMode!: (typeof appearanceThemes)[number];

  @IsIn(appearanceAccents)
  accentColor!: (typeof appearanceAccents)[number];

  @IsIn(appearanceTitleSizes)
  titleFontSize!: (typeof appearanceTitleSizes)[number];

  @IsIn(appearanceHeaderSizes)
  headerFontSize!: (typeof appearanceHeaderSizes)[number];

  @IsIn(appearanceBodySizes)
  bodyFontSize!: (typeof appearanceBodySizes)[number];

  @IsIn(appearanceDensities)
  layoutDensity!: (typeof appearanceDensities)[number];
}
