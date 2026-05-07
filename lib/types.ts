export type ReviewSort = 'MOST_RECENT' | 'POSITIVE_FIRST' | 'NEGATIVE_FIRST' | 'MOST_HELPFUL' | 'HIGHEST_RATING' | 'LOWEST_RATING';

export interface ProductMeta {
  title: string;
  image?: string;
  rating?: number;
  reviewCount?: number;
  reviewPageUrl: string;
  pid?: string;
  itemId?: string;
}

export interface ReviewItem {
  id: string;
  reviewerName: string;
  rating: number;
  title: string;
  text: string;
  dateLabel: string;
  dateValue?: number;
  verifiedBuyer: boolean;
  helpfulCount: number;
  variant?: string;
  images: string[];
  reviewUrl?: string;
  reviewPageUrl: string;
}

export interface ReviewsResponse {
  product: ProductMeta;
  reviews: ReviewItem[];
  page: number;
  hasMore: boolean;
  sort: ReviewSort;
  totalParsed: number;
  warning?: string;
}
