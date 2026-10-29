import { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

export type Category = 'Video' | 'Audio' | 'Image' | 'More';
export type InputKind = 'url' | 'video' | 'audio' | 'image' | 'images' | 'text';

export type ToolOption =
  | { type: 'chips'; key: string; label: string; choices: string[] }
  | { type: 'toggle'; key: string; label: string; description?: string }
  | { type: 'timeRange'; key: string; label: string };

export type Tool = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: IconName;
  color: string;
  category: Category;
  input: InputKind;
  actionLabel: string;
  options: ToolOption[];
};

export const CATEGORIES: Category[] = ['Video', 'Audio', 'Image', 'More'];

export const TOOLS: Tool[] = [
  // ---------- VIDEO ----------
  {
    id: 'video-downloader',
    title: 'Video Downloader',
    subtitle: 'Save videos from a link',
    description: 'Paste a video link and save it straight to your phone in the quality you want.',
    icon: 'cloud-download-outline',
    color: '#6366F1',
    category: 'Video',
    input: 'url',
    actionLabel: 'Download',
    options: [
      { type: 'chips', key: 'quality', label: 'Quality', choices: ['Best', '1080p', '720p', '480p'] },
      { type: 'chips', key: 'format', label: 'Save as', choices: ['Video (MP4)', 'Audio only (MP3)'] },
    ],
  },
  // {
  //   id: 'video-compressor',
  //   title: 'Video Compressor',
  //   subtitle: 'Shrink video file size',
  //   description: 'Reduce video size for WhatsApp, email or storage without losing much quality.',
  //   icon: 'film-outline',
  //   color: '#0EA5E9',
  //   category: 'Video',
  //   input: 'video',
  //   actionLabel: 'Compress Video',
  //   options: [
  //     { type: 'chips', key: 'quality', label: 'Compression', choices: ['Light', 'Balanced', 'Maximum'] },
  //     { type: 'chips', key: 'resolution', label: 'Resolution', choices: ['Original', '1080p', '720p', '480p'] },
  //     { type: 'toggle', key: 'mute', label: 'Remove audio', description: 'Makes the file even smaller' },
  //   ],
  // },
  {
    id: 'extract-audio',
    title: 'Extract Audio',
    subtitle: 'Get music from a video',
    description: 'Pull the soundtrack out of any video and save it as an audio file.',
    icon: 'musical-notes-outline',
    color: '#F59E0B',
    category: 'Video',
    input: 'video',
    actionLabel: 'Extract Audio',
    options: [
      { type: 'chips', key: 'format', label: 'Format', choices: ['MP3', 'AAC', 'WAV', 'M4A'] },
      { type: 'chips', key: 'bitrate', label: 'Bitrate', choices: ['128 kbps', '192 kbps', '320 kbps'] },
    ],
  },
  // {
  //   id: 'video-to-gif',
  //   title: 'Video to GIF',
  //   subtitle: 'Turn clips into GIFs',
  //   description: 'Pick a short part of a video and turn it into a shareable GIF.',
  //   icon: 'images-outline',
  //   color: '#EC4899',
  //   category: 'Video',
  //   input: 'video',
  //   actionLabel: 'Create GIF',
  //   options: [
  //     { type: 'timeRange', key: 'range', label: 'Select clip' },
  //     { type: 'chips', key: 'fps', label: 'Frame rate', choices: ['10 fps', '15 fps', '24 fps'] },
  //     { type: 'chips', key: 'size', label: 'Size', choices: ['Small', 'Medium', 'Large'] },
  //   ],
  // },

  // ---------- AUDIO ----------
  {
    id: 'audio-cutter',
    title: 'Audio Cutter',
    subtitle: 'Trim songs & ringtones',
    description: 'Cut the exact part of a song you want, perfect for ringtones and status.',
    icon: 'cut-outline',
    color: '#10B981',
    category: 'Audio',
    input: 'audio',
    actionLabel: 'Cut Audio',
    options: [
      { type: 'timeRange', key: 'range', label: 'Select part' },
      { type: 'toggle', key: 'fadeIn', label: 'Fade in' },
      { type: 'toggle', key: 'fadeOut', label: 'Fade out' },
      { type: 'chips', key: 'format', label: 'Save as', choices: ['MP3', 'M4A', 'WAV'] },
    ],
  },
  // {
  //   id: 'audio-converter',
  //   title: 'Audio Converter',
  //   subtitle: 'Change audio format',
  //   description: 'Convert audio files between popular formats in a couple of taps.',
  //   icon: 'swap-horizontal-outline',
  //   color: '#14B8A6',
  //   category: 'Audio',
  //   input: 'audio',
  //   actionLabel: 'Convert',
  //   options: [
  //     { type: 'chips', key: 'format', label: 'Convert to', choices: ['MP3', 'AAC', 'WAV', 'FLAC', 'OGG'] },
  //     { type: 'chips', key: 'quality', label: 'Quality', choices: ['Standard', 'High', 'Lossless'] },
  //   ],
  // },

  // ---------- IMAGE ----------
  {
    id: 'image-compressor',
    title: 'Image Compressor',
    subtitle: 'Reduce photo size',
    description: 'Make photos lighter for uploads and forms while keeping them sharp.',
    icon: 'contract-outline',
    color: '#8B5CF6',
    category: 'Image',
    input: 'images',
    actionLabel: 'Compress Images',
    options: [
      { type: 'chips', key: 'level', label: 'Compression', choices: ['Low', 'Medium', 'High'] },
      { type: 'chips', key: 'output', label: 'Output format', choices: ['Same as input', 'JPG', 'WEBP'] },
      { type: 'toggle', key: 'exif', label: 'Keep photo details', description: 'Date, location and camera info' },
    ],
  },
  {
    id: 'aspect-ratio',
    title: 'Aspect Ratio',
    subtitle: 'Fit photos to any ratio',
    description: 'Fit the full photo into a new shape for Instagram, stories or YouTube, without cropping anything.',
    icon: 'resize-outline',
    color: '#F43F5E',
    category: 'Image',
    input: 'image',
    actionLabel: 'Apply Ratio',
    options: [
      { type: 'chips', key: 'ratio', label: 'Ratio', choices: ['1:1', '4:5', '9:16', '16:9', '3:2', '4:3'] },
      { type: 'chips', key: 'background', label: 'Fill background', choices: ['Blur', 'White', 'Black'] },
    ],
  },
  {
    id: 'image-converter',
    title: 'Image Converter',
    subtitle: 'JPG, PNG, WEBP & more',
    description: 'Change image formats, including converting iPhone HEIC photos to JPG.',
    icon: 'repeat-outline',
    color: '#3B82F6',
    category: 'Image',
    input: 'images',
    actionLabel: 'Convert Images',
    options: [
      { type: 'chips', key: 'format', label: 'Convert to', choices: ['JPG', 'PNG', 'WEBP'] },
    ],
  },
  // {
  //   id: 'text-scanner',
  //   title: 'Text Scanner',
  //   subtitle: 'Copy text from images',
  //   description: 'Pick a photo of a document or screenshot and copy the text from it.',
  //   icon: 'scan-outline',
  //   color: '#0891B2',
  //   category: 'Image',
  //   input: 'image',
  //   actionLabel: 'Extract Text',
  //   options: [
  //     { type: 'chips', key: 'language', label: 'Language', choices: ['English', 'Hindi', 'Bengali'] },
  //   ],
  // },

  // ---------- MORE ----------
  {
    id: 'images-to-pdf',
    title: 'Images to PDF',
    subtitle: 'Turn photos into a PDF',
    description: 'Combine photos of documents into a single, clean PDF file.',
    icon: 'document-text-outline',
    color: '#EF4444',
    category: 'More',
    input: 'images',
    actionLabel: 'Create PDF',
    options: [
      { type: 'chips', key: 'pageSize', label: 'Page size', choices: ['A4', 'Letter', 'Fit to image'] },
      { type: 'chips', key: 'margin', label: 'Margin', choices: ['None', 'Small', 'Large'] },
    ],
  },
  {
    id: 'qr-generator',
    title: 'QR Generator',
    subtitle: 'Text, links & Wi-Fi',
    description: 'Create a QR code for a link, text, phone number or Wi-Fi network.',
    icon: 'qr-code-outline',
    color: '#475569',
    category: 'More',
    input: 'text',
    actionLabel: 'Generate QR',
    options: [
      { type: 'chips', key: 'type', label: 'Type', choices: ['Text', 'Link', 'Wi-Fi', 'Phone'] },
      { type: 'chips', key: 'color', label: 'Color', choices: ['Black', 'Indigo', 'Green'] },
    ],
  },
];