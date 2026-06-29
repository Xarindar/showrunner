"use client";

import { useMemo, useRef, useState } from "react";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProductSlugFields({
  productId,
  slug,
  summary,
  title
}: {
  productId: string;
  slug: string;
  summary: string;
  title: string;
}) {
  const initialAutoSlug = useMemo(() => slugify(title), [title]);
  const [titleValue, setTitleValue] = useState(title);
  const [slugValue, setSlugValue] = useState(slug);
  const isSlugAutoRef = useRef(!slug || slug === initialAutoSlug);
  const lastAutoSlugRef = useRef(initialAutoSlug);

  const handleTitleChange = (nextTitle: string) => {
    const nextSlug = slugify(nextTitle);
    const shouldSyncSlug = isSlugAutoRef.current || slugValue === lastAutoSlugRef.current;

    setTitleValue(nextTitle);
    if (shouldSyncSlug) {
      setSlugValue(nextSlug);
      isSlugAutoRef.current = true;
    }
    lastAutoSlugRef.current = nextSlug;
  };

  const handleSlugChange = (nextSlug: string) => {
    const sanitizedSlug = slugify(nextSlug);
    const generatedSlug = slugify(titleValue);

    setSlugValue(sanitizedSlug);
    isSlugAutoRef.current = !sanitizedSlug || sanitizedSlug === generatedSlug;
    lastAutoSlugRef.current = generatedSlug;
  };

  return (
    <>
      <div className="ui-field">
        <label htmlFor={`product-${productId}-name`}>Title</label>
        <input id={`product-${productId}-name`} name="name" onChange={(event) => handleTitleChange(event.currentTarget.value)} required value={titleValue} />
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor={`product-${productId}-slug`}>Shop URL slug</label>
          <input id={`product-${productId}-slug`} name="slug" onChange={(event) => handleSlugChange(event.currentTarget.value)} value={slugValue} />
        </div>
        <div className="ui-field">
          <label htmlFor={`product-${productId}-summary`}>Short summary</label>
          <input defaultValue={summary} id={`product-${productId}-summary`} name="summary" />
        </div>
      </div>
    </>
  );
}
