CREATE TABLE "terms_acceptance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"terms_version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
