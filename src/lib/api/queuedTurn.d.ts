export interface QueuedTurnSnapshot {
    queued_turn_id: string;
    message_preview: string;
    message_text: string;
    created_at: number;
    image_count: number;
    position: number;
}
export declare function normalizeQueuedTurnSnapshot(snapshot: unknown): QueuedTurnSnapshot | null;
export declare function normalizeQueuedTurnSnapshots(snapshots: unknown): QueuedTurnSnapshot[];
