"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Star, X } from "lucide-react";
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
    notify("Photos added to this draft. Save the session to keep your choices.");
  }
  return <div className={styles.media} role="group" aria-label="Service photos">
    <input type="hidden" name="serviceMedia" value={JSON.stringify({ square: encode(main), rectangular: encode(websitePhoto), gallery: gallery.map(asset => asset.id) })} />
    <div className={styles.heading}>
      <span className={styles.photoLabel}>Photos</span>
      {gallery.length < 50 && <AssetPicker assets={gallery} canUpload={canUpload} uploadAction={uploadServiceMediaAssetAction} onUploadedAssets={addImages}
        triggerClassName="ui-button ui-button-secondary" title="Add service photos" confirmLabel="Add photo" onSelectAsset={asset => addImages([asset])}>
        <Plus aria-hidden="true" size={15} /><span>Add photos</span>
      </AssetPicker>}
    </div>
    {!main && !websitePhoto && !gallery.length && <p className={styles.help}>Upload or choose photos for this session.</p>}
    <ul className={styles.gallery} aria-label="Selected service photos">
      {main && <li className={styles.hero}>
        <AssetPicker assets={[main.asset]} canUpload={canUpload} uploadAction={uploadServiceMediaAssetAction}
          title="Choose main photo" triggerClassName={styles.choosePhoto}
          onUploadedAssets={assets => addImages(assets, true)} onSelectAsset={asset => addImages([asset], true)}>
          <span className={styles.preview}><Image fill sizes="204px" unoptimized src={main.asset.url || main.asset.thumbnailUrl} alt={main.asset.alt} draggable={false} /></span>
        </AssetPicker>
        <div className={styles.photoActions}><span className={styles.help}>Main</span><Button type="button" size="sm" variant="ghost" aria-label="Remove main photo" onClick={() => setMain(null)}><X size={15} aria-hidden="true" /></Button></div>
      </li>}
      {websitePhoto && <li>
        <Image width={96} height={96} unoptimized src={websitePhoto.asset.thumbnailUrl} alt={websitePhoto.asset.alt} draggable={false} />
        <div className={styles.photoActions}><Button type="button" variant="ghost" size="sm" aria-label="Use website photo as main" onClick={() => addImages([websitePhoto.asset], true)}><Star size={15} aria-hidden="true" /></Button><Button type="button" variant="ghost" size="sm" aria-label="Remove website photo" onClick={() => setWebsitePhoto(null)}><X size={15} aria-hidden="true" /></Button></div>
      </li>}
      {gallery.filter(asset => asset.id !== main?.asset.id).map(asset => <li key={asset.id}>
        <Image width={96} height={96} unoptimized src={asset.thumbnailUrl} alt={asset.alt} draggable={false} />
        <div className={styles.photoActions}><Button type="button" variant="ghost" size="sm" aria-label={`Use ${asset.filename} as main`} onClick={() => { setMain({ asset, framing: centeredFraming }); setGallery(current => current.map(item => item.id === asset.id && main ? main.asset : item).filter(item => item.id !== asset.id)); }}><Star size={15} aria-hidden="true" /></Button><Button type="button" variant="ghost" size="sm" aria-label={`Remove ${asset.filename}`} onClick={() => setGallery(current => current.filter(item => item.id !== asset.id))}><X size={15} aria-hidden="true" /></Button></div>
      </li>)}
    </ul>
  </div>;
}
