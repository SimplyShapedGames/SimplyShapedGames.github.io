import type { ImageMetadata } from 'astro';
import shapedash from '../../assets/img/GameLogo_ShapeDash.png';
import pieceperfect from '../../assets/img/Sprite_GameFeature2.png';
import slide from '../../assets/img/GamePanel_Slide.png';
import pieceperfectIcon from '../../assets/img/Sprite_GameLogo2.png';
import slideIcon from '../../assets/img/GameLogo_Slide.png';
import copycat from '../assets/projects/copycat-expansion.png';
import witch from '../assets/projects/witch-who-laughs.jpg';
import witchIcon from '../assets/projects/witch-who-laughs-icon.jpg';
import sticker from '../assets/projects/geneva-window-sticker.png';
import copycatMaterials from '../assets/projects/gallery/copycat-materials.png';
import copycatSnow from '../assets/projects/gallery/copycat-snow.png';
import gymboreeReopening from '../assets/projects/gallery/gymboree-reopening.png';
import witchPlayback from '../assets/projects/gallery/witch-playback.jpg';
import gymboreeWebsite from '../assets/projects/gymboree-website.png';
import ssgWebsite from '../assets/projects/ssg-website.png';
export const artwork: Record<string, ImageMetadata> = { shapedash, pieceperfect, slide, pieceperfectIcon, slideIcon, copycat, witch, witchIcon, sticker, copycatMaterials, copycatSnow, gymboreeReopening, witchPlayback, gymboreeWebsite, ssgWebsite };

const legacyArtwork: Record<string, ImageMetadata> = {
  '/assets/img/GameLogo_ShapeDash.png': shapedash,
  '/assets/img/Sprite_GameLogo2.png': pieceperfectIcon,
  '/assets/img/Sprite_GameFeature2.png': pieceperfect,
  '/assets/img/GameLogo_Slide.png': slideIcon,
  '/assets/img/GamePanel_Slide.png': slide,
};

// Prefer the real asset closest to the slot's proportions; never distort it.
export function closestArtwork(candidates: (ImageMetadata | undefined)[], ratio: number) {
  return candidates.filter((image): image is ImageMetadata => !!image)
    .sort((a, b) => Math.abs(Math.log(a.width / a.height / ratio)) - Math.abs(Math.log(b.width / b.height / ratio)))[0];
}
export function projectArtwork(data: { icon?: string; cover?: string }, ratio: number) {
  return closestArtwork([data.icon ? artwork[data.icon] : undefined, data.cover ? artwork[data.cover] : undefined], ratio);
}
export function journalArtwork(data: { image?: string; 'wide-image'?: string; 'thumbnail-img'?: string; 'cover-img'?: string }, ratio: number) {
  return closestArtwork([
    data.image ? artwork[data.image] : undefined,
    data['wide-image'] ? artwork[data['wide-image']] : undefined,
    data['thumbnail-img'] ? legacyArtwork[data['thumbnail-img']] : undefined,
    data['cover-img'] ? legacyArtwork[data['cover-img']] : undefined,
  ], ratio);
}
