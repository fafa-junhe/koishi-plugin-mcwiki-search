import { Context, Schema } from 'koishi';
export declare const name = "mcwiki-search";
export interface Config {
    viewportWidth: number;
    viewportHeight: number;
    timeout: number;
    server: string;
    path: string;
    maxItem: number;
}
export declare const Config: Schema<Config>;
export declare const inject: {
    required: string[];
};
declare module 'koishi' {
    interface Events {
        'mcwiki-search-wait-for-input'(...args: any[]): void;
    }
}
export declare function apply(ctx: Context, config: Config): Promise<void>;
