export type ReportRange = {
  from: string; // YYYY-MM-DD (inclusive)
  to: string;   // YYYY-MM-DD (inclusive)
};

export type ReportSummary = {
  totalUnits: number;
  nightsInRange: number;
  occupiedNights: number;
  occupancyPercent: number;
  totalCharged: number;   // non-voided folio charges posted in range (UGX)
  totalCollected: number; // folio payments recorded in range (UGX)
  stays: number;          // bookings whose stay overlaps the range
  arrivals: number;       // check-ins in range
  departures: number;     // check-outs in range
  inHouseNow: number;     // currently checked-in (point in time)
};

export type RevenueByRoomType = {
  room_type: string;
  revenue: number;
  charge_count: number;
};

export type RevenueByCategory = {
  category: string;
  revenue: number;
  charge_count: number;
};

export type RevenueByMonth = {
  month: string; // YYYY-MM
  revenue: number;
};

export type DailyMovement = {
  date: string; // YYYY-MM-DD
  arrivals: number;
  departures: number;
  occupied: number;
};

export type ReportData = {
  range: ReportRange;
  summary: ReportSummary;
  byRoomType: RevenueByRoomType[];
  byCategory: RevenueByCategory[];
  byMonth: RevenueByMonth[];
  daily: DailyMovement[];
};
