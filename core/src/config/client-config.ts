// GENERATED from config/client.schema.json by 'npm run gen:types'. Do not edit by hand.

/**
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "e164".
 */
export type E164 = string;
/**
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "hhmm".
 */
export type Hhmm = string;
/**
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "day_hours".
 */
export type DayHours = {
  open: Hhmm;
  close: Hhmm;
}[];
/**
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "slug".
 */
export type Slug = string;
/**
 * '<client_id>/<name>' — the name of an n8n credential or Supabase Vault secret. Never a secret value.
 *
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "credential_ref".
 */
export type CredentialRef = string;

/**
 * Everything that differs between clients. Secrets are never stored here: fields named `credential` hold a reference '<client_id>/<name>' to an n8n credential or Supabase Vault secret.
 */
export interface NuvadeskClientConfiguration {
  $schema?: string;
  schema_version: 1;
  /**
   * Stable slug; used in webhook paths, credential names and Supabase rows.
   */
  client_id: string;
  name: string;
  vertical:
    "dental" | "physio" | "allied_health" | "real_estate" | "home_services" | "law" | "ecommerce" | "recruitment";
  /**
   * Selects the Supabase project (data residency).
   */
  region: "au" | "eu" | "us";
  timezone: string;
  locale: "en-AU" | "en-GB" | "en-US";
  status?: "demo" | "staging" | "uat" | "live" | "paused" | "offboarded";
  /**
   * @minItems 1
   */
  packages: ["A" | "B" | "C" | "D" | "voice", ...("A" | "B" | "C" | "D" | "voice")[]];
  care_plan: "keep_alive" | "grow" | "partner" | "none";
  business: {
    legal_name: string;
    address: string;
    phone: E164;
    email?: string;
    website?: string;
    google_review_url?: string;
    parking?: string;
    /**
     * Opening hours per weekday; omit or use [] for closed.
     */
    hours: {
      mon?: DayHours;
      tue?: DayHours;
      wed?: DayHours;
      thu?: DayHours;
      fri?: DayHours;
      sat?: DayHours;
      sun?: DayHours;
    };
    holidays?: {
      date: string;
      name?: string;
    }[];
    /**
     * Optional calendar ID whose all-day events count as closures.
     */
    holiday_calendar?: string;
    /**
     * @minItems 1
     */
    services: [
      {
        id: Slug;
        name: string;
        /**
         * The service's ID in the booking system (Cliniko appointment type, Acuity appointment type, Calendly event type URI, Bookings service ID).
         */
        external_id?: string;
        duration_minutes: number;
        price?: Money;
        /**
         * e.g. 'from', 'gap-free with selected health funds'
         */
        price_note?: string;
        new_patients?: boolean;
        bookable_online?: boolean;
      },
      ...{
        id: Slug;
        name: string;
        /**
         * The service's ID in the booking system (Cliniko appointment type, Acuity appointment type, Calendly event type URI, Bookings service ID).
         */
        external_id?: string;
        duration_minutes: number;
        price?: Money;
        /**
         * e.g. 'from', 'gap-free with selected health funds'
         */
        price_note?: string;
        new_patients?: boolean;
        bookable_online?: boolean;
      }[]
    ];
    policies?: {
      cancellation?: string;
      cancellation_notice_hours?: number;
      payment?: string;
      insurance?: string;
    };
    staff?: {
      name: string;
      role: string;
      bio?: string;
    }[];
    /**
     * Documents the assistant may send with send_document (forms, price sheets, directions).
     */
    documents?: {
      id: Slug;
      name: string;
      url: string;
      /**
       * When the assistant should offer it.
       */
      when?: string;
    }[];
    /**
     * Documents chunked and embedded into faq_chunks.
     */
    faq_sources?: {
      type: "url" | "file" | "inline";
      ref: string;
    }[];
  };
  channels: {
    whatsapp?: {
      enabled: boolean;
      phone_number_id?: string;
      display_number?: E164;
      credential?: CredentialRef;
      /**
       * Logical name → approved Meta template name.
       */
      templates?: {
        [k: string]: string;
      };
    };
    sms?: {
      enabled: boolean;
      from_number?: E164;
      credential?: CredentialRef;
    };
    webchat?: {
      enabled: boolean;
      allowed_origins?: string[];
      accent_color?: string;
    };
    missed_call?: {
      enabled: boolean;
      provider?: "twilio" | "ringcentral" | "aircall" | "3cx";
      text_back_channel?: "sms" | "whatsapp";
      text_back_delay_seconds?: number;
    };
    email?: {
      enabled: boolean;
      from_address?: string;
      credential?: CredentialRef;
    };
  };
  assistant: {
    persona_name: string;
    /**
     * Short style guide, e.g. 'warm, brief, Australian English, no emojis'.
     */
    tone: string;
    /**
     * Sent in the first message of every thread (AI disclosure).
     */
    disclosure_text: string;
    /**
     * @minItems 1
     */
    languages: [string, ...string[]];
    forbidden_topics?: string[];
    extra_rules?: string[];
    after_hours?: {
      greeting?: string;
      emergency_text?: string;
      allow_booking?: boolean;
    };
    confidence_threshold?: number;
    max_messages_per_contact_per_hour?: number;
    llm: {
      primary: ModelRef;
      classifier: ModelRef;
      fallback?: ModelRef;
      embeddings: ModelRef;
      monthly_cap_usd: number;
    };
  };
  booking?: {
    /**
     * jane and link run in link-out mode: the assistant sends booking_link instead of booking directly (Jane's API is partner-gated with no public booking endpoint).
     */
    adapter: "google_calendar" | "cliniko" | "acuity" | "microsoft_bookings" | "calendly" | "jane" | "link";
    credential?: CredentialRef;
    /**
     * Provider account context: Cliniko business ID + shard (e.g. 'au1:12345'), Bookings business ID, or Calendly organization URI.
     */
    account_id?: string;
    /**
     * Online booking page. Used for link-out mode (adapter 'link', or Jane) and as a fallback when the adapter fails.
     */
    booking_link?: string;
    calendars?: {
      id: string;
      practitioner?: string;
      services?: Slug[];
    }[];
    buffer_minutes?: number;
    min_notice_minutes?: number;
    max_days_ahead?: number;
    /**
     * No new-patient appointments starting after this local time.
     */
    new_patient_cutoff?: string;
    reminders_hours_before?: number[];
    no_show_followup_minutes?: number;
    send_ics?: boolean;
  };
  lead_qualification?: {
    sources?: ("web_form" | "facebook_lead_ads" | "google_ads" | "email" | "webchat" | "whatsapp")[];
    /**
     * @minItems 3
     * @maxItems 7
     */
    questions:
      | [
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          }
        ]
      | [
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          }
        ]
      | [
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          }
        ]
      | [
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          }
        ]
      | [
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          },
          {
            id: Slug;
            text: string;
            type: "choice" | "text" | "number" | "date";
            options?: {
              label: string;
              score: number;
            }[];
            weight?: number;
            /**
             * Branching: skip when this expression over earlier answers is true.
             */
            skip_if?: string;
          }
        ];
    llm_judgement_weight?: number;
    thresholds: {
      hot: number;
      warm: number;
    };
    hot_notify?: E164[];
    /**
     * @maxItems 7
     */
    nurture?:
      | []
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ]
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ]
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ]
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ]
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ]
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ]
      | [
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          },
          {
            day: number;
            channel: "sms" | "whatsapp" | "email";
            /**
             * Message body for SMS/email ({name} is replaced with the lead's first name). For WhatsApp it is the fallback when no template is set.
             */
            text: string;
            /**
             * Email subject.
             */
            subject?: string;
            /**
             * Approved WhatsApp template name (required to message outside the 24-hour window).
             */
            template?: string;
          }
        ];
  };
  crm?: {
    /**
     * Zoho, Salesforce and Airtable are on the roadmap (spec §4.5) but not implemented yet.
     */
    adapter: "hubspot" | "pipedrive" | "gohighlevel" | "google_sheets" | "none";
    credential?: CredentialRef;
    /**
     * Nuvadesk field → CRM field.
     */
    field_mapping?: {
      [k: string]: string;
    };
    sheet_id?: string;
    sheet_tab?: string;
    /**
     * GoHighLevel location ID.
     */
    account_id?: string;
  };
  escalation: {
    /**
     * whatsapp_staff: a card with an "I'll take it" button to each staff number (the Cloud API cannot post into WhatsApp groups). telegram: one card in a staff group via the client's bot. sms: plain text to each staff number.
     */
    channel: "whatsapp_staff" | "telegram" | "sms";
    /**
     * People who can take over a conversation. Their phone numbers are recognised as staff when they message the client's number, so their replies are relayed to the customer.
     *
     * @minItems 1
     */
    staff: [
      {
        name: string;
        phone: E164;
      },
      ...{
        name: string;
        phone: E164;
      }[]
    ];
    /**
     * Required when channel is telegram.
     */
    telegram_chat_id?: string;
    /**
     * '<client_id>/<name>' — the name of an n8n credential or Supabase Vault secret. Never a secret value.
     */
    credential?: string;
    owner_backup?: E164;
    claim_timeout_minutes?: number;
    ai_pause_minutes?: number;
  };
  reporting: {
    /**
     * @minItems 1
     */
    owner_emails: [string, ...string[]];
    daily_digest?: boolean;
    weekly_day?: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    weekly_time?: Hhmm;
    slack_webhook_credential?: CredentialRef;
    revenue_per_booking?: Money;
  };
  compliance: {
    regime: "au_spam_act" | "us_tcpa" | "uk_pecr" | "eu_gdpr";
    marketing_consent_text?: string;
    /**
     * Matched against the whole trimmed message, case-insensitive — so 'cancel my appointment' is a booking request, while a bare 'CANCEL' is an opt-out.
     *
     * @minItems 1
     */
    stop_keywords: [string, ...string[]];
    stop_reply?: string;
    retention_months: number;
    /**
     * Redact health details from stored transcripts (required for US clinics).
     */
    phi_minimization?: boolean;
    dpa_signed_on?: string;
  };
}
/**
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "money".
 */
export interface Money {
  amount: number;
  currency: "AUD" | "GBP" | "USD" | "EUR";
}
/**
 * This interface was referenced by `NuvadeskClientConfiguration`'s JSON-Schema
 * via the `definition` "model_ref".
 */
export interface ModelRef {
  provider: "anthropic" | "openai";
  model: string;
  credential: CredentialRef;
  effort?: "low" | "medium" | "high";
}
