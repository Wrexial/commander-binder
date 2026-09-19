CREATE TABLE "binders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"columns" integer DEFAULT 3 NOT NULL,
	"rows" integer DEFAULT 3 NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"slots" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "binders_user_id_name_idx" ON "binders" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "binders_user_id_idx" ON "binders" USING btree ("user_id");