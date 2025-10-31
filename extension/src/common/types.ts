
export interface RangePath {
    index: number;
    name: string;
}

export interface Range {
    start: {
        offset: number;
        path: RangePath[];
    };
    end: {
        offset: number;
        path: RangePath[];
    };
}

export interface AnnotationRecord {
    id: string;
    kind: string;
    style: string | null;
    color: string | null;
    content: string;
    tags: string[];
}