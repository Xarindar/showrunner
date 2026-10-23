"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { AssetPicker, Button, type AssetPickerAsset } from "@/components/ui";
import { ImageFramingControl } from "@/modules/content/studio/image-framing-control";
import { centeredFraming, type ImageFraming } from "@/modules/content/studio/image-framing";
import { uploadServiceMediaAssetAction } from "../actions";
import styles from "./service-media-fields.module.css";

type Photo = { asset: AssetPickerAsset; framing: ImageFraming };

export function ServiceMediaFields({ canUpload, initialSquare = null, initialRectangular = null, initialGallery = [] }: {
  canUpload: boolean; initialSquare?: Photo | null; initialRectangular?: Photo | null; initialGallery?: AssetPickerAsset[];
}) {
  const [square, setSquare] = useState(initialSquare);
  const [rectangular, setRectangular] = useState(initialRectangular);
  const [gallery, setGallery] = useState(initialGallery);
  const [notice, setNotice] = useState("");
  const encode = (photo: Photo | null) => photo ? { assetId: photo.asset.id || null, framing: photo.framing } : null;
  function addImages(assets: AssetPickerAsset[]) {
    setGallery(current => {
      const combined = [...new Map([...current, ...assets].map(asset => [asset.id, asset])).values()];
      return combined.slice(0, 50);
    });
    setNotice("Images added. Save the session type to keep your choices. Up to 50 additional images can be attached; all uploads remain in the media library.");
  }
  return <section className="studio-panel" aria-labelledby="service-media-title">
    <h2 id="service-media-title" className="section-title">Media</h2>
    <input type="hidden" name="serviceMedia" value={JSON.stringify({ square: encode(square), rectangular: encode(rectangular), gallery: gallery.map(asset => asset.id) })} />
    <div className={styles.photos}>
      {([{ key: "rectangular", label: "Rectangular photo", ratio: 4 / 3, photo: rectangular, setPhoto: setRectangular },
        { key: "square", label: "Square photo", ratio: 1, photo: square, setPhoto: setSquare }] as const).map(({ key, label, ratio, photo, setPhoto }) => <div className={styles.photo} key={key}>
        <h3>{label}</h3>
        <AssetPicker assets={photo ? [photo.asset] : []} canUpload={canUpload} uploadAction={uploadServiceMediaAssetAction}
          title={`Choose ${label.toLowerCase()}`} triggerClassName={styles.choosePhoto} triggerHint={`Choose or upload ${label.toLowerCase()}`}
          onSelectAsset={asset => setPhoto({ asset, framing: centeredFraming })}>
          <span className={styles.preview} style={{ aspectRatio: ratio }}>
            {photo ? <Image fill sizes="(max-width: 600px) 100vw, 400px" unoptimized src={photo.asset.url || photo.asset.thumbnailUrl} alt={photo.asset.alt} draggable={false} style={{ objectPosition: `${photo.framing.imagePositionX}% ${photo.framing.imagePositionY}%`, transformOrigin: `${photo.framing.imagePositionX}% ${photo.framing.imagePositionY}%`, transform: `scale(${photo.framing.imageZoom})` }} />
              : <span className={styles.placeholder}><ImageIcon aria-hidden="true" size={24} /><span>Choose or upload</span></span>}
          </span>
        </AssetPicker>
        <p className={styles.help}>{key === "square" ? "1:1 · Used as the booking photo." : "4:3 · For landscape website layouts."}</p>
        {photo && <div className={styles.actions}>
          <ImageFramingControl source={photo.asset.url || photo.asset.thumbnailUrl} ratio={ratio} value={photo.framing} onChange={framing => setPhoto({ ...photo, framing })} />
          <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => setPhoto(null)}>Remove</Button>
        </div>}
      </div>)}
    </div>
    <div className={styles.additional}>
      <h3>Additional images</h3>
      <p className={styles.help}>Keep photos with this service for future website use. Removing a photo here keeps the original in your media library.</p>
      {gallery.length > 0 && <ul className={styles.gallery} aria-label="Additional service images">{gallery.map(asset => <li key={asset.id}>
        <Image width={160} height={160} unoptimized src={asset.thumbnailUrl} alt={asset.alt} draggable={false} />
        <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${asset.filename}`} onClick={() => setGallery(current => current.filter(item => item.id !== asset.id))}>Remove</Button>
      </li>)}</ul>}
      <AssetPicker assets={gallery} canUpload={canUpload} uploadAction={uploadServiceMediaAssetAction} onUploadedAssets={addImages}
        title="Add service images" confirmLabel="Add image" onSelectAsset={asset => addImages([asset])}>Add images</AssetPicker>
      <p className={styles.help}>Photos and framing save with the session type. Original uploads are preserved.</p>
      {notice && <p role="status" className={styles.help}>{notice}</p>}
    </div>
  </section>;
}
