CREATE TABLE "wishlist_cards" (
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_cards_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
