CREATE FUNCTION "habit_weekdays_are_canonical"("value" smallint[]) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
	previous_weekday smallint := 0;
	weekday smallint;
BEGIN
	IF array_ndims("value") IS DISTINCT FROM 1
		OR array_lower("value", 1) IS DISTINCT FROM 1 THEN
		RETURN false;
	END IF;
	IF cardinality("value") NOT BETWEEN 1 AND 7
		OR array_position("value", NULL) IS NOT NULL THEN
		RETURN false;
	END IF;
	FOREACH weekday IN ARRAY "value" LOOP
		IF weekday NOT BETWEEN 1 AND 7 OR weekday <= previous_weekday THEN
			RETURN false;
		END IF;
		previous_weekday := weekday;
	END LOOP;
	RETURN true;
END;
$$;
--> statement-breakpoint
-- Generated from shared/validation/canonical-time-zones.generated.json; the P3 parity test
-- compares this function body with that artifact exactly.
CREATE FUNCTION "habit_timezone_is_valid"("value" text) RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
	SELECT "value" = ANY (ARRAY[
		'UTC', 'Africa/Abidjan', 'Africa/Accra',
		'Africa/Addis_Ababa', 'Africa/Algiers', 'Africa/Asmera',
		'Africa/Bamako', 'Africa/Bangui', 'Africa/Banjul',
		'Africa/Bissau', 'Africa/Blantyre', 'Africa/Brazzaville',
		'Africa/Bujumbura', 'Africa/Cairo', 'Africa/Casablanca',
		'Africa/Ceuta', 'Africa/Conakry', 'Africa/Dakar',
		'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Douala',
		'Africa/El_Aaiun', 'Africa/Freetown', 'Africa/Gaborone',
		'Africa/Harare', 'Africa/Johannesburg', 'Africa/Juba',
		'Africa/Kampala', 'Africa/Khartoum', 'Africa/Kigali',
		'Africa/Kinshasa', 'Africa/Lagos', 'Africa/Libreville',
		'Africa/Lome', 'Africa/Luanda', 'Africa/Lubumbashi',
		'Africa/Lusaka', 'Africa/Malabo', 'Africa/Maputo',
		'Africa/Maseru', 'Africa/Mbabane', 'Africa/Mogadishu',
		'Africa/Monrovia', 'Africa/Nairobi', 'Africa/Ndjamena',
		'Africa/Niamey', 'Africa/Nouakchott', 'Africa/Ouagadougou',
		'Africa/Porto-Novo', 'Africa/Sao_Tome', 'Africa/Tripoli',
		'Africa/Tunis', 'Africa/Windhoek', 'America/Adak',
		'America/Anchorage', 'America/Anguilla', 'America/Antigua',
		'America/Araguaina', 'America/Argentina/La_Rioja', 'America/Argentina/Rio_Gallegos',
		'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis',
		'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Aruba',
		'America/Asuncion', 'America/Bahia', 'America/Bahia_Banderas',
		'America/Barbados', 'America/Belem', 'America/Belize',
		'America/Blanc-Sablon', 'America/Boa_Vista', 'America/Bogota',
		'America/Boise', 'America/Buenos_Aires', 'America/Cambridge_Bay',
		'America/Campo_Grande', 'America/Cancun', 'America/Caracas',
		'America/Catamarca', 'America/Cayenne', 'America/Cayman',
		'America/Chicago', 'America/Chihuahua', 'America/Ciudad_Juarez',
		'America/Coral_Harbour', 'America/Cordoba', 'America/Costa_Rica',
		'America/Coyhaique', 'America/Creston', 'America/Cuiaba',
		'America/Curacao', 'America/Danmarkshavn', 'America/Dawson',
		'America/Dawson_Creek', 'America/Denver', 'America/Detroit',
		'America/Dominica', 'America/Edmonton', 'America/Eirunepe',
		'America/El_Salvador', 'America/Fort_Nelson', 'America/Fortaleza',
		'America/Glace_Bay', 'America/Godthab', 'America/Goose_Bay',
		'America/Grand_Turk', 'America/Grenada', 'America/Guadeloupe',
		'America/Guatemala', 'America/Guayaquil', 'America/Guyana',
		'America/Halifax', 'America/Havana', 'America/Hermosillo',
		'America/Indiana/Knox', 'America/Indiana/Marengo', 'America/Indiana/Petersburg',
		'America/Indiana/Tell_City', 'America/Indiana/Vevay', 'America/Indiana/Vincennes',
		'America/Indiana/Winamac', 'America/Indianapolis', 'America/Inuvik',
		'America/Iqaluit', 'America/Jamaica', 'America/Jujuy',
		'America/Juneau', 'America/Kentucky/Monticello', 'America/Kralendijk',
		'America/La_Paz', 'America/Lima', 'America/Los_Angeles',
		'America/Louisville', 'America/Lower_Princes', 'America/Maceio',
		'America/Managua', 'America/Manaus', 'America/Marigot',
		'America/Martinique', 'America/Matamoros', 'America/Mazatlan',
		'America/Mendoza', 'America/Menominee', 'America/Merida',
		'America/Metlakatla', 'America/Mexico_City', 'America/Miquelon',
		'America/Moncton', 'America/Monterrey', 'America/Montevideo',
		'America/Montserrat', 'America/Nassau', 'America/New_York',
		'America/Nome', 'America/Noronha', 'America/North_Dakota/Beulah',
		'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/Ojinaga',
		'America/Panama', 'America/Paramaribo', 'America/Phoenix',
		'America/Port-au-Prince', 'America/Port_of_Spain', 'America/Porto_Velho',
		'America/Puerto_Rico', 'America/Punta_Arenas', 'America/Rankin_Inlet',
		'America/Recife', 'America/Regina', 'America/Resolute',
		'America/Rio_Branco', 'America/Santarem', 'America/Santiago',
		'America/Santo_Domingo', 'America/Sao_Paulo', 'America/Scoresbysund',
		'America/Sitka', 'America/St_Barthelemy', 'America/St_Johns',
		'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas',
		'America/St_Vincent', 'America/Swift_Current', 'America/Tegucigalpa',
		'America/Thule', 'America/Tijuana', 'America/Toronto',
		'America/Tortola', 'America/Vancouver', 'America/Whitehorse',
		'America/Winnipeg', 'America/Yakutat', 'Antarctica/Casey',
		'Antarctica/Davis', 'Antarctica/DumontDUrville', 'Antarctica/Macquarie',
		'Antarctica/Mawson', 'Antarctica/McMurdo', 'Antarctica/Palmer',
		'Antarctica/Rothera', 'Antarctica/Syowa', 'Antarctica/Troll',
		'Antarctica/Vostok', 'Arctic/Longyearbyen', 'Asia/Aden',
		'Asia/Almaty', 'Asia/Amman', 'Asia/Anadyr',
		'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Ashgabat',
		'Asia/Atyrau', 'Asia/Baghdad', 'Asia/Bahrain',
		'Asia/Baku', 'Asia/Bangkok', 'Asia/Barnaul',
		'Asia/Beirut', 'Asia/Bishkek', 'Asia/Brunei',
		'Asia/Calcutta', 'Asia/Chita', 'Asia/Colombo',
		'Asia/Damascus', 'Asia/Dhaka', 'Asia/Dili',
		'Asia/Dubai', 'Asia/Dushanbe', 'Asia/Famagusta',
		'Asia/Gaza', 'Asia/Hebron', 'Asia/Hong_Kong',
		'Asia/Hovd', 'Asia/Irkutsk', 'Asia/Jakarta',
		'Asia/Jayapura', 'Asia/Jerusalem', 'Asia/Kabul',
		'Asia/Kamchatka', 'Asia/Karachi', 'Asia/Katmandu',
		'Asia/Khandyga', 'Asia/Krasnoyarsk', 'Asia/Kuala_Lumpur',
		'Asia/Kuching', 'Asia/Kuwait', 'Asia/Macau',
		'Asia/Magadan', 'Asia/Makassar', 'Asia/Manila',
		'Asia/Muscat', 'Asia/Nicosia', 'Asia/Novokuznetsk',
		'Asia/Novosibirsk', 'Asia/Omsk', 'Asia/Oral',
		'Asia/Phnom_Penh', 'Asia/Pontianak', 'Asia/Pyongyang',
		'Asia/Qatar', 'Asia/Qostanay', 'Asia/Qyzylorda',
		'Asia/Rangoon', 'Asia/Riyadh', 'Asia/Saigon',
		'Asia/Sakhalin', 'Asia/Samarkand', 'Asia/Seoul',
		'Asia/Shanghai', 'Asia/Singapore', 'Asia/Srednekolymsk',
		'Asia/Taipei', 'Asia/Tashkent', 'Asia/Tbilisi',
		'Asia/Tehran', 'Asia/Thimphu', 'Asia/Tokyo',
		'Asia/Tomsk', 'Asia/Ulaanbaatar', 'Asia/Urumqi',
		'Asia/Ust-Nera', 'Asia/Vientiane', 'Asia/Vladivostok',
		'Asia/Yakutsk', 'Asia/Yekaterinburg', 'Asia/Yerevan',
		'Atlantic/Azores', 'Atlantic/Bermuda', 'Atlantic/Canary',
		'Atlantic/Cape_Verde', 'Atlantic/Faeroe', 'Atlantic/Madeira',
		'Atlantic/Reykjavik', 'Atlantic/South_Georgia', 'Atlantic/St_Helena',
		'Atlantic/Stanley', 'Australia/Adelaide', 'Australia/Brisbane',
		'Australia/Broken_Hill', 'Australia/Darwin', 'Australia/Eucla',
		'Australia/Hobart', 'Australia/Lindeman', 'Australia/Lord_Howe',
		'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
		'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Astrakhan',
		'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin',
		'Europe/Bratislava', 'Europe/Brussels', 'Europe/Bucharest',
		'Europe/Budapest', 'Europe/Busingen', 'Europe/Chisinau',
		'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Gibraltar',
		'Europe/Guernsey', 'Europe/Helsinki', 'Europe/Isle_of_Man',
		'Europe/Istanbul', 'Europe/Jersey', 'Europe/Kaliningrad',
		'Europe/Kiev', 'Europe/Kirov', 'Europe/Lisbon',
		'Europe/Ljubljana', 'Europe/London', 'Europe/Luxembourg',
		'Europe/Madrid', 'Europe/Malta', 'Europe/Mariehamn',
		'Europe/Minsk', 'Europe/Monaco', 'Europe/Moscow',
		'Europe/Oslo', 'Europe/Paris', 'Europe/Podgorica',
		'Europe/Prague', 'Europe/Riga', 'Europe/Rome',
		'Europe/Samara', 'Europe/San_Marino', 'Europe/Sarajevo',
		'Europe/Saratov', 'Europe/Simferopol', 'Europe/Skopje',
		'Europe/Sofia', 'Europe/Stockholm', 'Europe/Tallinn',
		'Europe/Tirane', 'Europe/Ulyanovsk', 'Europe/Vaduz',
		'Europe/Vatican', 'Europe/Vienna', 'Europe/Vilnius',
		'Europe/Volgograd', 'Europe/Warsaw', 'Europe/Zagreb',
		'Europe/Zurich', 'Indian/Antananarivo', 'Indian/Chagos',
		'Indian/Christmas', 'Indian/Cocos', 'Indian/Comoro',
		'Indian/Kerguelen', 'Indian/Mahe', 'Indian/Maldives',
		'Indian/Mauritius', 'Indian/Mayotte', 'Indian/Reunion',
		'Pacific/Apia', 'Pacific/Auckland', 'Pacific/Bougainville',
		'Pacific/Chatham', 'Pacific/Easter', 'Pacific/Efate',
		'Pacific/Enderbury', 'Pacific/Fakaofo', 'Pacific/Fiji',
		'Pacific/Funafuti', 'Pacific/Galapagos', 'Pacific/Gambier',
		'Pacific/Guadalcanal', 'Pacific/Guam', 'Pacific/Honolulu',
		'Pacific/Kiritimati', 'Pacific/Kosrae', 'Pacific/Kwajalein',
		'Pacific/Majuro', 'Pacific/Marquesas', 'Pacific/Midway',
		'Pacific/Nauru', 'Pacific/Niue', 'Pacific/Norfolk',
		'Pacific/Noumea', 'Pacific/Pago_Pago', 'Pacific/Palau',
		'Pacific/Pitcairn', 'Pacific/Ponape', 'Pacific/Port_Moresby',
		'Pacific/Rarotonga', 'Pacific/Saipan', 'Pacific/Tahiti',
		'Pacific/Tarawa', 'Pacific/Tongatapu', 'Pacific/Truk',
		'Pacific/Wake', 'Pacific/Wallis'
	]::text[]);
$$;
--> statement-breakpoint
CREATE TABLE "habit_logs" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"state" text NOT NULL,
	"quantity" numeric(12, 3),
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_logs_pkey" PRIMARY KEY("user_id","id"),
	CONSTRAINT "habit_logs_user_habit_date_unique" UNIQUE("user_id","habit_id","local_date"),
	CONSTRAINT "habit_logs_state_check" CHECK ("habit_logs"."state" in ('completed', 'skipped', 'unachieved')),
	CONSTRAINT "habit_logs_quantity_check" CHECK (("habit_logs"."state" = 'completed' and (
          "habit_logs"."quantity" is null or "habit_logs"."quantity" between 0 and 999999999.999
        )) or ("habit_logs"."state" in ('skipped', 'unachieved') and "habit_logs"."quantity" is null)),
	CONSTRAINT "habit_logs_note_check" CHECK ("habit_logs"."note" is null or (
          "habit_logs"."note" = normalize("habit_logs"."note", NFC)
          and char_length("habit_logs"."note") <= 1000
        )),
	CONSTRAINT "habit_logs_version_check" CHECK ("habit_logs"."version" > 0),
	CONSTRAINT "habit_logs_local_date_check" CHECK ("habit_logs"."local_date" between date '0001-01-01' and date '9999-12-31')
);
--> statement-breakpoint
CREATE TABLE "habit_schedules" (
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"weekdays" smallint[],
	"target_per_week" smallint,
	"timezone" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_schedules_pkey" PRIMARY KEY("user_id","habit_id"),
	CONSTRAINT "habit_schedules_kind_check" CHECK ("habit_schedules"."kind" in ('daily', 'weekdays', 'weekly_target')),
	CONSTRAINT "habit_schedules_shape_check" CHECK ((
          "habit_schedules"."kind" = 'daily'
          and "habit_schedules"."weekdays" is null
          and "habit_schedules"."target_per_week" is null
        ) or (
          "habit_schedules"."kind" = 'weekdays'
          and "habit_schedules"."weekdays" is not null
          and habit_weekdays_are_canonical("habit_schedules"."weekdays")
          and "habit_schedules"."target_per_week" is null
        ) or (
          "habit_schedules"."kind" = 'weekly_target'
          and "habit_schedules"."weekdays" is null
          and "habit_schedules"."target_per_week" is not null
          and "habit_schedules"."target_per_week" between 1 and 7
        )),
	CONSTRAINT "habit_schedules_timezone_check" CHECK (char_length("habit_schedules"."timezone") between 1 and 128 and habit_timezone_is_valid("habit_schedules"."timezone")),
	CONSTRAINT "habit_schedules_date_bounds_check" CHECK ("habit_schedules"."start_date" between date '0001-01-01' and date '9999-12-31'
          and ("habit_schedules"."end_date" is null or (
            "habit_schedules"."end_date" between date '0001-01-01' and date '9999-12-31'
            and "habit_schedules"."end_date" >= "habit_schedules"."start_date"
          )))
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"icon" text NOT NULL,
	"color_token" text NOT NULL,
	"goal_kind" text NOT NULL,
	"target_value" numeric(12, 3),
	"unit" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "habits_pkey" PRIMARY KEY("user_id","id"),
		CONSTRAINT "habits_title_check" CHECK ("habits"."title" = normalize("habits"."title", NFC)
    and "habits"."title" = btrim("habits"."title", E'\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF')
    and char_length("habits"."title") between 1 and 200),
	CONSTRAINT "habits_icon_check" CHECK ("habits"."icon" = normalize("habits"."icon", NFC)
    and "habits"."icon" = btrim("habits"."icon", E'\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF')
    and char_length("habits"."icon") between 1 and 16),
	CONSTRAINT "habits_color_token_check" CHECK ("habits"."color_token" in ('coral', 'amber', 'mint', 'sky', 'violet', 'slate')),
	CONSTRAINT "habits_goal_kind_check" CHECK ("habits"."goal_kind" in ('boolean', 'quantity')),
	CONSTRAINT "habits_goal_shape_check" CHECK ((
          "habits"."goal_kind" = 'boolean'
          and "habits"."target_value" is null
          and "habits"."unit" is null
        ) or (
          "habits"."goal_kind" = 'quantity'
          and "habits"."target_value" is not null
          and "habits"."target_value" between 0.001 and 999999999.999
          and "habits"."unit" is not null
          and "habits"."unit" = normalize("habits"."unit", NFC)
    and "habits"."unit" = btrim("habits"."unit", E'\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF')
    and char_length("habits"."unit") between 1 and 40
        )),
	CONSTRAINT "habits_version_check" CHECK ("habits"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_owner_fk" FOREIGN KEY ("user_id","habit_id") REFERENCES "habits"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_schedules" ADD CONSTRAINT "habit_schedules_habit_owner_fk" FOREIGN KEY ("user_id","habit_id") REFERENCES "habits"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_logs_user_local_date_idx" ON "habit_logs" USING btree ("user_id","local_date","habit_id");--> statement-breakpoint
CREATE INDEX "habit_schedules_user_dates_idx" ON "habit_schedules" USING btree ("user_id","start_date","end_date","habit_id");--> statement-breakpoint
CREATE INDEX "habits_user_active_updated_idx" ON "habits" USING btree ("user_id","updated_at" DESC NULLS LAST,"id") WHERE "habits"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "habits_user_archived_updated_idx" ON "habits" USING btree ("user_id","updated_at" DESC NULLS LAST,"id") WHERE "habits"."archived_at" is not null;
--> statement-breakpoint
CREATE FUNCTION "habit_logs_validate_goal_shape"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	owner_goal_kind text;
BEGIN
	SELECT "goal_kind"
		INTO owner_goal_kind
		FROM "habits"
		WHERE "user_id" = NEW."user_id" AND "id" = NEW."habit_id"
		FOR KEY SHARE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'habit log owner does not exist' USING ERRCODE = '23503';
	END IF;
	IF owner_goal_kind = 'boolean' AND NEW."quantity" IS NOT NULL THEN
		RAISE EXCEPTION 'boolean habit logs cannot store a quantity' USING ERRCODE = '23514';
	END IF;
	IF owner_goal_kind = 'quantity'
		AND NEW."state" = 'completed'
		AND NEW."quantity" IS NULL THEN
		RAISE EXCEPTION 'quantity habit completions require a quantity' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "habit_logs_validate_goal_shape_trigger"
BEFORE INSERT OR UPDATE OF "user_id", "habit_id", "state", "quantity" ON "habit_logs"
FOR EACH ROW EXECUTE FUNCTION "habit_logs_validate_goal_shape"();
--> statement-breakpoint
CREATE FUNCTION "habit_assert_inserted_schedule"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "habits" WHERE "user_id" = NEW."user_id" AND "id" = NEW."id"
	) AND NOT EXISTS (
		SELECT 1 FROM "habit_schedules"
		WHERE "user_id" = NEW."user_id" AND "habit_id" = NEW."id"
	) THEN
		RAISE EXCEPTION 'each habit requires exactly one schedule' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "habits_require_schedule_trigger"
AFTER INSERT ON "habits"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "habit_assert_inserted_schedule"();
--> statement-breakpoint
CREATE FUNCTION "habit_prevent_schedule_orphan"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "habits" WHERE "user_id" = OLD."user_id" AND "id" = OLD."habit_id"
	) AND NOT EXISTS (
		SELECT 1 FROM "habit_schedules"
		WHERE "user_id" = OLD."user_id" AND "habit_id" = OLD."habit_id"
	) THEN
		RAISE EXCEPTION 'each habit requires exactly one schedule' USING ERRCODE = '23514';
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "habit_schedules_prevent_orphan_trigger"
AFTER DELETE OR UPDATE ON "habit_schedules"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "habit_prevent_schedule_orphan"();
