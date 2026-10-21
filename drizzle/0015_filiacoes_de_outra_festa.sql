CREATE TABLE "prior_affiliation" (
	"cpf" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"registration_number" text,
	"confirmed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
