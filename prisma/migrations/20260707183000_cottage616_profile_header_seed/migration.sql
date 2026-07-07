-- Seed Cottage 616 profile headers from the live static pages without
-- overwriting later edits. The older hero backfill used SiteSettings hero copy
-- ("Book Cottage 616"), so only that exact legacy slide is replaced.

WITH target_settings AS (
  SELECT settings."siteId"
  FROM "SiteSettings" settings
  JOIN "Site" site ON site."id" = settings."siteId"
  WHERE settings."businessName" = 'Cottage 616'
     OR site."name" = 'Cottage 616'
),
defaults AS (
  SELECT
    '{
      "label": "Cottage 616",
      "header": {
        "copy": "A peaceful indoor and outdoor event venue and head-spa retreat for intimate weddings, baby showers, birthday parties, girls'' nights, and relaxing appointments surrounded by serene country views.",
        "ctaHref": "booking.html",
        "ctaLabel": "Book Now",
        "eyebrow": "",
        "headline": "Cottage 616"
      },
      "featured": {
        "categoryId": "events",
        "copy": "Request celebrations, showers, intimate weddings, and Hive head-spa appointments.",
        "cta": "Start booking",
        "enabled": true,
        "imageUrl": "",
        "packageId": "",
        "serviceId": "",
        "targetType": "CATEGORY",
        "title": "Let''s get this party started"
      },
      "testimonialHeading": "Sweet words from Cottage guests",
      "testimonialIds": [],
      "testimonialIntro": "A few kind notes from celebrations, showers, and peaceful days at Cottage 616."
    }'::jsonb AS cottage616,
    '{
      "label": "The Hive",
      "header": {
        "copy": "A quiet head-spa retreat for scalp care, deep relaxation, hydration, and healthy shine at Cottage 616.",
        "ctaHref": "booking.html",
        "ctaLabel": "Book The Hive",
        "eyebrow": "",
        "headline": "Buzz off, stress."
      },
      "featured": {
        "categoryId": "the-hive",
        "copy": "Choose a restorative head-spa appointment inside The Hive at Cottage 616.",
        "cta": "Book The Hive",
        "enabled": true,
        "imageUrl": "",
        "packageId": "",
        "serviceId": "",
        "targetType": "CATEGORY",
        "title": "Book your Hive reset"
      },
      "testimonialHeading": "What Hive guests are saying",
      "testimonialIds": [],
      "testimonialIntro": "Notes from head-spa guests who came in ready for softer hair and quieter shoulders."
    }'::jsonb AS hive
)
UPDATE "SiteSettings" settings
SET "publicContentConfig" = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(settings."publicContentConfig", '{}'::jsonb),
      '{profiles}',
      COALESCE(settings."publicContentConfig" -> 'profiles', '{}'::jsonb),
      true
    ),
    '{profiles,cottage616}',
    defaults.cottage616 || COALESCE(settings."publicContentConfig" #> '{profiles,cottage616}', '{}'::jsonb),
    true
  ),
  '{profiles,the-hive}',
  defaults.hive || COALESCE(settings."publicContentConfig" #> '{profiles,the-hive}', '{}'::jsonb),
  true
)
FROM target_settings, defaults
WHERE settings."siteId" = target_settings."siteId";

WITH target_settings AS (
  SELECT settings."siteId"
  FROM "SiteSettings" settings
  JOIN "Site" site ON site."id" = settings."siteId"
  WHERE settings."businessName" = 'Cottage 616'
     OR site."name" = 'Cottage 616'
)
UPDATE "HeroSlide" slide
SET
  "headline" = 'Cottage 616',
  "caption" = 'A peaceful indoor and outdoor event venue and head-spa retreat for intimate weddings, baby showers, birthday parties, girls'' nights, and relaxing appointments surrounded by serene country views.',
  "ctaLabel" = 'Book Now',
  "ctaHref" = 'booking.html',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "HeroPresentation" presentation, target_settings
WHERE slide."presentationId" = presentation."id"
  AND presentation."siteId" = target_settings."siteId"
  AND presentation."profileKey" = 'cottage616'
  AND slide."sortOrder" = 0
  AND slide."headline" = 'Book Cottage 616'
  AND slide."caption" = 'Request celebrations, showers, intimate weddings, and Hive head-spa appointments.'
  AND slide."ctaLabel" = 'Book an appointment'
  AND slide."ctaHref" = '/book';

WITH target_settings AS (
  SELECT settings."siteId"
  FROM "SiteSettings" settings
  JOIN "Site" site ON site."id" = settings."siteId"
  WHERE settings."businessName" = 'Cottage 616'
     OR site."name" = 'Cottage 616'
)
INSERT INTO "HeroPresentation" ("id", "siteId", "profileKey", "mode", "autoplayIntervalMs", "createdAt", "updatedAt")
SELECT
  'hero_presentation_' || md5(target_settings."siteId" || ':the-hive'),
  target_settings."siteId",
  'the-hive',
  'STATIC'::"HeroPresentationMode",
  6500,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM target_settings
WHERE NOT EXISTS (
  SELECT 1
  FROM "HeroPresentation" existing
  WHERE existing."siteId" = target_settings."siteId"
    AND existing."profileKey" = 'the-hive'
);

WITH target_presentations AS (
  SELECT presentation."id", presentation."siteId", presentation."profileKey"
  FROM "HeroPresentation" presentation
  JOIN "SiteSettings" settings ON settings."siteId" = presentation."siteId"
  JOIN "Site" site ON site."id" = settings."siteId"
  WHERE (settings."businessName" = 'Cottage 616' OR site."name" = 'Cottage 616')
    AND presentation."profileKey" IN ('cottage616', 'the-hive')
),
slide_defaults AS (
  SELECT
    'cottage616'::text AS "profileKey",
    'Cottage 616'::text AS "headline",
    'A peaceful indoor and outdoor event venue and head-spa retreat for intimate weddings, baby showers, birthday parties, girls'' nights, and relaxing appointments surrounded by serene country views.'::text AS "caption",
    'Book Now'::text AS "ctaLabel",
    'booking.html'::text AS "ctaHref"
  UNION ALL
  SELECT
    'the-hive',
    'Buzz off, stress.',
    'A quiet head-spa retreat for scalp care, deep relaxation, hydration, and healthy shine at Cottage 616.',
    'Book The Hive',
    'booking.html'
)
INSERT INTO "HeroSlide" (
  "id",
  "presentationId",
  "sortOrder",
  "headline",
  "caption",
  "imageUrl",
  "ctaLabel",
  "ctaHref",
  "createdAt",
  "updatedAt"
)
SELECT
  'hero_slide_' || md5(target_presentations."siteId" || ':' || target_presentations."profileKey" || ':0'),
  target_presentations."id",
  0,
  slide_defaults."headline",
  slide_defaults."caption",
  '/hero.svg',
  slide_defaults."ctaLabel",
  slide_defaults."ctaHref",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM target_presentations
JOIN slide_defaults ON slide_defaults."profileKey" = target_presentations."profileKey"
WHERE NOT EXISTS (
  SELECT 1
  FROM "HeroSlide" existing
  WHERE existing."presentationId" = target_presentations."id"
    AND existing."sortOrder" = 0
);

INSERT INTO "HeroSlideElement" (
  "id",
  "slideId",
  "type",
  "gridColumn",
  "gridRow",
  "columnSpan",
  "rowSpan",
  "zIndex",
  "isVisible",
  "createdAt",
  "updatedAt"
)
SELECT
  'hero_element_' || md5(slide."id" || ':' || element."type"),
  slide."id",
  element."type"::"HeroSlideElementType",
  element."gridColumn",
  element."gridRow",
  element."columnSpan",
  element."rowSpan",
  element."zIndex",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "HeroSlide" slide
JOIN "HeroPresentation" presentation ON presentation."id" = slide."presentationId"
JOIN "SiteSettings" settings ON settings."siteId" = presentation."siteId"
JOIN "Site" site ON site."id" = settings."siteId"
CROSS JOIN (
  VALUES
    ('IMAGE', 1, 1, 30, 18, 1),
    ('HEADLINE', 1, 1, 18, 2, 2),
    ('CAPTION', 1, 5, 15, 3, 3),
    ('CTA', 1, 10, 5, 2, 4)
) AS element("type", "gridColumn", "gridRow", "columnSpan", "rowSpan", "zIndex")
WHERE (settings."businessName" = 'Cottage 616' OR site."name" = 'Cottage 616')
  AND presentation."profileKey" IN ('cottage616', 'the-hive')
  AND NOT EXISTS (
    SELECT 1
    FROM "HeroSlideElement" existing
    WHERE existing."slideId" = slide."id"
      AND existing."type" = element."type"::"HeroSlideElementType"
  );
