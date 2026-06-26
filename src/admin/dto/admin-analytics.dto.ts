export class DauPointDto {
  date: string;
  value: number;
}

export class AdminAnalyticsOverviewDto {
  totalUsers: number;
  teachers: number;
  students: number;
  dau: number;
  examCount: number;
  sessionCount: number;
  submissionCount: number;
}

export class AdminDauChartDto {
  data: DauPointDto[];
}
