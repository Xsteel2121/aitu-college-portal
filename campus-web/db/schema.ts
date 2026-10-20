import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const homework = sqliteTable("homework", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull(), subject: text("subject").notNull(),
  body: text("body").notNull(), authorId: text("author_id").notNull(), authorName: text("author_name").notNull(),
  assignedDate: text("assigned_date").notNull(), createdAt: integer("created_at").notNull(),
  done: integer("done").notNull().default(0), doneAt: integer("done_at"),
  status: text("status").notNull().default("approved"),
}, t=>[index("homework_group_date").on(t.groupId,t.assignedDate),index("homework_author_created").on(t.authorId,t.createdAt)]);
export const subscriptions = sqliteTable("subscriptions", {
  id:text("id").primaryKey(), actorId:text("actor_id").notNull(), groupId:text("group_id").notNull(),
  subscription:text("subscription").notNull(), lessons:integer("lessons").notNull().default(1),
  digest:integer("digest").notNull().default(1), active:integer("active").notNull().default(1), createdAt:integer("created_at").notNull(),
}, t=>[index("subscriptions_actor").on(t.actorId),index("subscriptions_group_active").on(t.groupId,t.active)]);
export const events=sqliteTable("notification_events",{id:text("id").primaryKey(),createdAt:integer("created_at").notNull()});
export const outbox=sqliteTable("notification_outbox", {
  id:text("id").primaryKey(),eventId:text("event_id").notNull(),subscriptionId:text("subscription_id").notNull(),
  payload:text("payload").notNull(),status:text("status").notNull().default("pending"),
  expiresAt:integer("expires_at").notNull(), attempts:integer("attempts").notNull().default(0),
  leaseUntil:integer("lease_until").notNull().default(0), nextAttempt:integer("next_attempt").notNull().default(0),
},t=>[index("outbox_status_next").on(t.status,t.nextAttempt)]);

export const moderatorSessions = sqliteTable('moderator_sessions', {
  tokenHash:text('token_hash').primaryKey(),groupId:text('group_id').notNull(),codeVersion:text('code_version').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const accessAttempts = sqliteTable('access_attempts', {
  key:text('key').primaryKey(),attempts:integer('attempts').notNull().default(0),window:integer('window').notNull(),
});
export const moderationLog = sqliteTable('moderation_log', {
  id:text('id').primaryKey(),homeworkId:text('homework_id').notNull(),groupId:text('group_id').notNull(),moderatorHash:text('moderator_hash').notNull(),action:text('action').notNull(),createdAt:integer('created_at').notNull(),
});
export const attachments = sqliteTable('homework_attachments', {
  id:text('id').primaryKey(), homeworkId:text('homework_id').references(()=>homework.id),
  authorId:text('author_id').notNull(), name:text('name').notNull(),
  contentType:text('content_type').notNull(), size:integer('size').notNull(),
  storageKey:text('storage_key').notNull(), createdAt:integer('created_at').notNull(), ready:integer('ready').notNull().default(0),
},t=>[index('attachments_homework').on(t.homeworkId),index('attachments_author_created').on(t.authorId,t.createdAt)]);
