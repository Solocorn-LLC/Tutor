/**
 * Drizzle table definitions (domain slice).
 * Aggregated via ./index.ts — keep enums in ../enums.ts.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import * as enums from '../enums'

export const user = pgTable(
  'User',
  {
    userId: text('id').primaryKey().notNull(),
    email: text('email').notNull().unique(),
    password: text('password'),
    handle: text('handle'),
    role: enums.roleEnum('role').notNull(),
    /** 'active' | 'suspended' — admins can suspend accounts to block sign-in. */
    status: text('status').notNull().default('active'),
    emailVerified: timestamp('emailVerified', { withTimezone: true }),
    image: text('image'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    User_handle_idx: index('User_handle_idx').on(table.handle),
  })
)

export const account = pgTable(
  'Account',
  {
    accountId: text('id').primaryKey().notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  table => ({
    Account_userId_idx: index('Account_userId_idx').on(table.userId),
    Account_provider_providerAccountId_key: uniqueIndex(
      'Account_provider_providerAccountId_key'
    ).on(table.provider, table.providerAccountId),
  })
)

export const profile = pgTable(
  'Profile',
  {
    profileId: text('id').primaryKey().notNull(),
    userId: text('userId')
      .notNull()
      .unique()
      .references(() => user.userId, { onDelete: 'cascade' }),
    name: text('name'),
    username: text('username').unique(),
    bio: text('bio'),
    avatarUrl: text('avatarUrl'),
    dateOfBirth: timestamp('dateOfBirth', { withTimezone: true }),
    timezone: text('timezone').notNull().default('UTC'),
    emailNotifications: boolean('emailNotifications').notNull().default(true),
    smsNotifications: boolean('smsNotifications').notNull().default(false),
    studentUniqueId: text('studentUniqueId').unique(),
    subjectsOfInterest: text('subjectsOfInterest').array().notNull().default([]),
    preferredLanguages: text('preferredLanguages').array().notNull().default([]),
    learningGoals: text('learningGoals').array().notNull().default([]),
    tosAccepted: boolean('tosAccepted').notNull().default(false),
    tosAcceptedAt: timestamp('tosAcceptedAt', { withTimezone: true }),
    organizationName: text('organizationName'),
    isOnboarded: boolean('isOnboarded').notNull().default(false),
    hourlyRate: doublePrecision('hourlyRate'),
    oneOnOneEnabled: boolean('oneOnOneEnabled'),
    // When true, 1-on-1 sessions are offered free: booking skips payment and a
    // tutor-accepted request is confirmed immediately (no gateway needed).
    oneOnOneFree: boolean('oneOnOneFree').notNull().default(false),
    // Minutes of gap the tutor wants around 1-on-1 bookings, enforced in
    // conflict detection so back-to-back sessions can't be double-booked.
    bufferMinutes: integer('bufferMinutes'),
    credentials: text('credentials'),
    availability: jsonb('availability').default({}),
    paidClassesEnabled: boolean('paidClassesEnabled').notNull().default(false),
    paymentGatewayPreference: text('paymentGatewayPreference'),
    currency: text('currency'),
    nationality: text('nationality'),
    countryOfResidence: text('countryOfResidence'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    Profile_countryOfResidence_idx: index('Profile_countryOfResidence_idx').on(
      table.countryOfResidence
    ),
    Profile_hourlyRate_idx: index('Profile_hourlyRate_idx').on(table.hourlyRate),
    Profile_isOnboarded_idx: index('Profile_isOnboarded_idx').on(table.isOnboarded),
    Profile_subjectsOfInterest_idx: index('Profile_subjectsOfInterest_idx').using(
      'gin',
      table.subjectsOfInterest
    ),
    Profile_preferredLanguages_idx: index('Profile_preferredLanguages_idx').using(
      'gin',
      table.preferredLanguages
    ),
  })
)

export const tutorApplication = pgTable(
  'TutorApplication',
  {
    applicationId: text('id').primaryKey().notNull(),
    userId: text('userId')
      .notNull()
      .unique()
      .references(() => user.userId, { onDelete: 'cascade' }),
    firstName: text('firstName').notNull(),
    middleName: text('middleName'),
    lastName: text('lastName').notNull(),
    legalName: text('legalName'),
    countryOfResidence: text('countryOfResidence').notNull(),
    phoneCountryCode: text('phoneCountryCode').notNull(),
    phoneNumber: text('phoneNumber').notNull(),
    educationLevel: text('educationLevel').notNull(),
    hasTeachingCertificate: boolean('hasTeachingCertificate').notNull(),
    certificateName: text('certificateName'),
    certificateSubjects: text('certificateSubjects'),
    tutoringExperienceRange: text('tutoringExperienceRange').notNull(),
    globalExams: jsonb('globalExams').notNull().default([]),
    tutoringCountries: text('tutoringCountries').array().notNull().default([]),
    countrySubjectSelections: jsonb('countrySubjectSelections').notNull().default({}),
    categories: text('categories').array().notNull().default([]),
    username: text('username').notNull(),
    socialLinks: jsonb('socialLinks').default({}),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    TutorApplication_userId_idx: index('TutorApplication_userId_idx').on(table.userId),
    TutorApplication_username_idx: index('TutorApplication_username_idx').on(table.username),
  })
)

/**
 * Avatar image data stored in the database for environments without
 * persistent local filesystems (e.g. GCP Cloud Run). The actual image
 * bytes are kept as base64-encoded text so they survive container restarts.
 */
export const avatarStorage = pgTable(
  'AvatarStorage',
  {
    userId: text('userId')
      .primaryKey()
      .notNull()
      .references(() => user.userId, { onDelete: 'cascade' }),
    data: text('data').notNull(), // base64-encoded WebP image
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => ({
    AvatarStorage_userId_idx: index('AvatarStorage_userId_idx').on(table.userId),
  })
)
