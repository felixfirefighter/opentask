CREATE TABLE "openai_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"encryption_version" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "openai_credentials_encryption_version_check" CHECK ("openai_credentials"."encryption_version" > 0),
	CONSTRAINT "openai_credentials_encrypted_api_key_check" CHECK (char_length("openai_credentials"."encrypted_api_key") > 0)
);
--> statement-breakpoint
ALTER TABLE "openai_credentials" ADD CONSTRAINT "openai_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
