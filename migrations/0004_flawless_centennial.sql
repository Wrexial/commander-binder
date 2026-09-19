CREATE TABLE "card_list_items" (
	"list_id" text NOT NULL,
	"card_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "card_list_items_list_id_card_id_pk" PRIMARY KEY("list_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "card_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_list_items" ADD CONSTRAINT "card_list_items_list_id_card_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."card_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_list_items_list_id_idx" ON "card_list_items" USING btree ("list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_lists_user_id_name_idx" ON "card_lists" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "card_lists_user_id_idx" ON "card_lists" USING btree ("user_id");