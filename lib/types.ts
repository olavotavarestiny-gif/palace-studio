export type Category = {
  id: string;
  name: string;
  position: number;
  active: boolean;
};
export type Dish = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  photo: string | null;
  active: boolean;
};
export type MenuItem = {
  id: string;
  dishId: string | null;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  price: number;
  photo: string | null;
};
export type Draft = {
  menu_date: string;
  items: MenuItem[];
  revision: number;
  published_id: string | null;
  updated_at?: string;
};
export type Publication = {
  id: string;
  menu_date: string;
  version: number;
  items: MenuItem[];
  published_at: string;
  generation_status: "pending" | "generating" | "ready" | "error";
  generation_error: string | null;
  assets: Asset[];
};
export type Asset = {
  id: string;
  version_id: string;
  format: "feed" | "story";
  page: number;
  filename: string;
  generated_at: string;
};
export type Settings = {
  restaurantName: string;
  website: string;
  contact: string;
};
export type StudioState = {
  user: { name: string; email: string };
  today: string;
  categories: Category[];
  dishes: Dish[];
  draft: Draft;
  todayPublication: Publication | null;
  publications: Publication[];
  publicUrl: string;
  settings: Settings;
};
