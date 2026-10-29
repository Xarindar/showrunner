"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, Plus } from "lucide-react";
import { AssetPicker, type AssetPickerAsset } from "@/components/ui/asset-picker";
import { Button } from "@/components/ui/button";
import { useNotify } from "@/components/ui/notifications";
import { centeredFraming, type ImageFraming } from "@/modules/content/studio/image-framing";
import { uploadServiceMediaAssetAction } from "../actions";
import styles from "./service-media-fields.module.css";

type Photo = { asset: AssetPickerAsset; framing: ImageFraming };

export function ServiceMediaFields({ canUpload, initialSquare = null, initialRectangular = null, initialGallery = [] }: {
  canUpload: boolean; initialSquare?: Photo | null; initialRectangular?: Photo | null; initialGallery?: AssetPickerAsset[];
}) {
  const [main, setMain] = useState(initialSquare);
  const [websitePhoto, setWebsitePhoto] = useState(initialRectangular);
  const [gallery, setGallery] = useState(initialGallery);
  const notify = useNotify();
  const encode = (photo: Photo | null) => photo ? { assetId: photo.asset.id || null, framing: photo.framing } : null;
  function addImages(assets: AssetPickerAsset[], replaceMain = false) {
    if (!assets.length) return;
    const [first, ...rest] = assets;
    const makeMain = replaceMain || !main;
    if (makeMain) setMain({ asset: first, framing: main?.asset.id === first.id ? main.framing : centeredFraming });
    setGallery(current => [...new Map([...current, ...(makeMain ? rest : assets)].map(asset => [asset.id, asset])).values()].slice(0, 50));
    notify("Photos added to this draft. Save the session type to keep your choices.");
  }
  return <div className={styles.media} role="group" aria-label="Service photos">
    <input type="hidden" name="serviceMedia" value={JSON.stringify({ square: encode(main), rectangular: encode(websitePhoto), gallery: gallery.map(asset => asset.id) })} />
    <div className={styles.mainPhoto}>
      <AssetPicker assets={main ? [main.asset] : []} canUpload={canUpload} uploadAction={uploadServiceMediaAssetAction}
        title="Choose main photo" triggerClassName={styles.choosePhoto}
        onUploadedAssets={assets => addImages(assets, true)} onSelectAsset={asset => addImages([asset], true)}>
        <span className={styles.preview}>
          {main ? <Image fill sizes="64px" unoptimized src={main.asset.url || main.asset.thumbnailUrl} alt={main.asset.alt} draggable={false} />
            : <span className={styles.placeholder}><ImageIcon aria-hidden="true" size={22} /></span>}
        </span>
      </AssetPicker>
      <div className={styles.photoDetails}>
        <span className={styles.photoLabel}>Photo</span>
        <p className={styles.help}>{main ? main.asset.filename : "Click to upload or choose a photo"}</p>
        {main && <Button type="button" size="sm" variant="ghost" onClick={() => setMain(null)}>Remove main photo</Button>}
      </div>
    </div>
    <details className={styles.additional}>
      <summary>More photos{gallery.length || websitePhoto ? ` (${gallery.length + (websitePhoto ? 1 : 0)})` : ""}</summary>
      <ul className={styles.gallery} aria-label="Service photos">
        {websitePhoto && <li>
          <Image width={160} height={160} unoptimized src={websitePhoto.asset.thumbnailUrl} alt={websitePhoto.asset.alt} draggable={false} />
          <span className={styles.help}>Existing website photo</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => addImages([websitePhoto.asset], true)}>Use as main</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setWebsitePhoto(null)}>Remove website photo</Button>
        </li>}
        {gallery.map(asset => <li key={asset.id}>
          <Image width={160} height={160} unoptimized src={asset.thumbnailUrl} alt={asset.alt} draggable={false} />
          <Button type="button" variant="ghost" size="sm" onClick={() => addImages([asset], true)}>Use as main</Button>
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${asset.filename}`} onClick={() => setGallery(current => current.filter(item => item.id !== asset.id))}>Remove</Button>
        </li>)}
        {gallery.length < 50 && <li>
          <AssetPicker assets={gallery} canUpload={canUpload} uploadAction={uploadServiceMediaAssetAction} onUploadedAssets={addImages}
            triggerClassName={styles.addPhoto} title="Add service photos" confirmLabel="Add photo" onSelectAsset={asset => addImages([asset])}>
            <Plus aria-hidden="true" size={20} /><span>Add</span>
          </AssetPicker>
        </li>}
      </ul>
    </details>
  </div>;
}
