export class DauPointDto {
  date: string;
  value: number;
}

export class AdminAnalyticsOverviewDto {
  totalUsers: number;
  teachers: number;
  students: number;
  dau: number;
  examToday: number;
  examThisWeek: number;
  examThisMonth: number;
}

export class AdminDauChartDto {
  data: DauPointDto[];
}
