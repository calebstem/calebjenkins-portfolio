const fs = require('fs');
const path = require('path');
const https = require('https');
const { marked } = require('marked');
const matter = require('gray-matter');
const sharp = require('sharp');

// ============================================
// CONFIGURATION - Easy to customize!
// ============================================
// 
// All design values are now in one place at the top.
// Just edit the values below to customize your portfolio:
// - Change colors, fonts, sizes
// - Update homepage text
// - Adjust layout dimensions
// - Modify GIF file names
// - Adjust image optimization settings (IMAGE_CONFIG)
//
// After making changes, run: node build.js
// ============================================

// Directories
const PROJECTS_DIR = './projects';
const OUTPUT_DIR = './output';
const TEMPLATES_DIR = './templates';
const ASSETS_DIR = './assets';

// Image Optimization Configuration
const IMAGE_CONFIG = {
  maxWidth: 1920,           // Maximum width for full-size images
  thumbnailWidth: 1200,     // Width for thumbnail images (increased for sharper thumbnails)
  webpQuality: 90,          // WebP quality (0-100) - increased for better quality
  thumbnailQuality: 90,     // Separate quality for thumbnails
  maintainAspectRatio: true // Keep original aspect ratio
};

// Homepage Content
const HOMEPAGE_CONFIG = {
  title: 'Caleb Jenkins',
  subtitle: '🔥 BADASS CREATIONS 🔥',
  skeletonGifName: 'skeleton.gif',
  flameGifName: 'flame.gif'
};

// Design Configuration
const DESIGN_CONFIG = {
  // Homepage Container
  homepageWidth: '66vw',
  homepagePadding: '30px',
  homepageBorder: '4px outset #CCCCCC',
  homepageBg: '#FFFFFF',
  
  // Skeleton/Header Sizing
  skeletonWidth: '150px',
  skeletonPadding: '10px',
  skeletonBorder: '2px inset #666666',
  skeletonGap: '20px',
  
  // Colors
  colors: {
    text: '#000000',
    bg: '#FFFFFF',
    homepageBg: '#000000',
    headerBg: '#F0F0F0',
    headerBorder: '#CCCCCC',
    link: '#0000FF',
    linkVisited: '#800080',
    linkHover: '#FF0000',
    headerText: '#000080',
    flameText: '#FF3300',
    skeletonBg: '#000000',
    flameBg: '#000000',
    flameBorder: '#FF3300'
  },
  
  // Typography
  fonts: {
    body: '"Times New Roman", Times, serif',
    monospace: '"Courier New", monospace'
  },
  
  // Font Sizes
  fontSize: {
    body: '12pt',
    headerH1: 'clamp(14pt, 5vw, 48pt)',
    headerSubtitle: 'clamp(8pt, 2.5vw, 24pt)',
    typeLinks: '18pt',
    typeSection: '18pt',
    projectTitle: '20pt',
    projectCard: '14pt'
  }
};


// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Get all project types (sculpture, print, digital, photo-video)
function getProjectTypes() {
  return fs.readdirSync(PROJECTS_DIR)
    .filter(file => fs.statSync(path.join(PROJECTS_DIR, file)).isDirectory());
}

// Get all projects within a type
function getProjectsInType(type) {
  const typePath = path.join(PROJECTS_DIR, type);
  return fs.readdirSync(typePath)
    .filter(file => fs.statSync(path.join(typePath, file)).isDirectory())
    .map(projectName => ({
      name: projectName,
      type: type,
      path: path.join(typePath, projectName)
    }));
}

// Parse a project's info.md file
function parseProject(project) {
  const infoPath = path.join(project.path, 'info.md');
  
  if (!fs.existsSync(infoPath)) {
    console.warn(`No info.md found for ${project.name}`);
    return null;
  }
  
  const fileContent = fs.readFileSync(infoPath, 'utf-8');
  const { data, content } = matter(fileContent);
  
  // Get images and PDFs
  const imagesPath = path.join(project.path, 'images');
  let images = [];
  let pdfs = [];
  if (fs.existsSync(imagesPath)) {
    const allFiles = fs.readdirSync(imagesPath).sort();
    images = allFiles.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));
    pdfs = allFiles.filter(file => /\.(pdf)$/i.test(file));
  }
  
  // Get Vimeo URLs from frontmatter (can be string or array)
  let vimeos = [];
  if (data.vimeo) {
    if (Array.isArray(data.vimeo)) {
      vimeos = data.vimeo;
    } else {
      vimeos = [data.vimeo];
    }
  }
  
  // Get YouTube URLs from frontmatter (can be string or array)
  let youtubes = [];
  if (data.youtube) {
    if (Array.isArray(data.youtube)) {
      youtubes = data.youtube;
    } else {
      youtubes = [data.youtube];
    }
  }
  
  // Only process statement if content exists
  const hasStatement = content && content.trim().length > 0;
  
  return {
    ...project,
    title: data.title || project.name,
    date: data.date || '',
    materials: data.materials || '',
    statement: hasStatement ? marked(content) : '',
    images: images,
    pdfs: pdfs,
    vimeos: vimeos,
    youtubes: youtubes,
    slug: project.name
  };
}

// Collect all projects
function getAllProjects() {
  const types = getProjectTypes();
  const allProjects = [];
  
  types.forEach(type => {
    const projects = getProjectsInType(type);
    projects.forEach(project => {
      const parsed = parseProject(project);
      if (parsed) {
        allProjects.push(parsed);
      }
    });
  });
  
  return allProjects;
}

// Optimize and copy images to output, copy PDFs as-is
async function optimizeProjectImages(project) {
  const sourceImages = path.join(project.path, 'images');
  const destImages = path.join(OUTPUT_DIR, project.type, project.slug, 'images');
  
  // Always create destImages folder (needed for Vimeo thumbnails even if no source images)
  fs.mkdirSync(destImages, { recursive: true });
  
  // If no source images folder, skip image processing but still download video thumbnails
  if (!fs.existsSync(sourceImages)) {
    // Still download Vimeo and YouTube thumbnails even if no images folder exists
    const thumbnailPromises = [];
    
    if (project.vimeos && project.vimeos.length > 0) {
      project.vimeos.forEach((vimeoUrl) => {
        const videoId = getVimeoId(vimeoUrl);
        if (!videoId) return;
        
        const thumbnailUrl = `https://vumbnail.com/${videoId}.jpg`;
        const thumbnailPath = path.join(destImages, `vimeo-${videoId}-thumb.jpg`);
        
        // Check if thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
          console.log(`    ✓ Vimeo thumbnail already exists: vimeo-${videoId}-thumb.jpg`);
          return;
        }
        
        thumbnailPromises.push(
          downloadFile(thumbnailUrl, thumbnailPath)
            .then(() => console.log(`    ✓ Downloaded Vimeo thumbnail: vimeo-${videoId}-thumb.jpg`))
            .catch((error) => console.error(`    ✗ Error downloading Vimeo thumbnail for ${videoId}:`, error.message))
        );
      });
    }
    
    if (project.youtubes && project.youtubes.length > 0) {
      project.youtubes.forEach((youtubeUrl) => {
        const videoId = getYouTubeId(youtubeUrl);
        if (!videoId) return;
        
        const thumbnailPath = path.join(destImages, `youtube-${videoId}-thumb.jpg`);
        
        // Check if thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
          console.log(`    ✓ YouTube thumbnail already exists: youtube-${videoId}-thumb.jpg`);
          return;
        }
        
        thumbnailPromises.push(
          downloadYouTubeThumbnail(videoId, thumbnailPath)
            .then(() => console.log(`    ✓ Downloaded YouTube thumbnail: youtube-${videoId}-thumb.jpg`))
            .catch((error) => console.error(`    ✗ Error downloading YouTube thumbnail for ${videoId}:`, error.message))
        );
      });
    }
    
    if (thumbnailPromises.length > 0) {
      await Promise.all(thumbnailPromises);
    }
    return;
  }
  
  // Copy PDFs as-is (they'll be embedded as images in the HTML)
  if (project.pdfs && project.pdfs.length > 0) {
    project.pdfs.forEach(pdf => {
      const sourcePath = path.join(sourceImages, pdf);
      const destPath = path.join(destImages, pdf);
      fs.copyFileSync(sourcePath, destPath);
      console.log(`    ✓ Copied ${pdf}`);
    });
  }
  
  // Process each image
  const optimizationPromises = project.images.map(async (image) => {
    const sourcePath = path.join(sourceImages, image);
    const imageName = path.parse(image).name; // Get filename without extension
    const fullSizePath = path.join(destImages, `${imageName}.webp`);
    const thumbPath = path.join(destImages, `${imageName}-thumb.webp`);
    
    try {
      // Load the image
      const imageBuffer = fs.readFileSync(sourcePath);
      const imageSharp = sharp(imageBuffer);
      const metadata = await imageSharp.metadata();
      
      // Calculate dimensions maintaining aspect ratio
      let fullWidth = IMAGE_CONFIG.maxWidth;
      let fullHeight = null;
      let thumbWidth = IMAGE_CONFIG.thumbnailWidth;
      let thumbHeight = null;
      
      if (IMAGE_CONFIG.maintainAspectRatio && metadata.width && metadata.height) {
        if (metadata.width > IMAGE_CONFIG.maxWidth) {
          fullHeight = Math.round((IMAGE_CONFIG.maxWidth / metadata.width) * metadata.height);
        } else {
          fullWidth = metadata.width;
          fullHeight = metadata.height;
        }
        
        if (metadata.width > IMAGE_CONFIG.thumbnailWidth) {
          thumbHeight = Math.round((IMAGE_CONFIG.thumbnailWidth / metadata.width) * metadata.height);
        } else {
          thumbWidth = metadata.width;
          thumbHeight = metadata.height;
        }
      }
      
      // Generate full-size optimized image
      await imageSharp
        .clone()
        .resize(fullWidth, fullHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: IMAGE_CONFIG.webpQuality })
        .toFile(fullSizePath);
      
      // Generate thumbnail with sharper resampling
      await imageSharp
        .clone()
        .resize(thumbWidth, thumbHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3'  // Use Lanczos3 for sharper resampling
        })
        .webp({ quality: IMAGE_CONFIG.thumbnailQuality || IMAGE_CONFIG.webpQuality })
        .toFile(thumbPath);
      
      console.log(`    ✓ Optimized ${image} → ${imageName}.webp + ${imageName}-thumb.webp`);
    } catch (error) {
      console.error(`    ✗ Error optimizing ${image}:`, error.message);
      // Fallback: copy original if optimization fails
      fs.copyFileSync(sourcePath, path.join(destImages, image));
    }
  });
  
  await Promise.all(optimizationPromises);
  
  // Download and save video thumbnails (Vimeo and YouTube)
  const thumbnailPromises = [];
  
  if (project.vimeos && project.vimeos.length > 0) {
    project.vimeos.forEach((vimeoUrl) => {
      const videoId = getVimeoId(vimeoUrl);
      if (!videoId) return;
      
      const thumbnailUrl = `https://vumbnail.com/${videoId}.jpg`;
      const thumbnailPath = path.join(destImages, `vimeo-${videoId}-thumb.jpg`);
      
      // Check if thumbnail already exists
      if (fs.existsSync(thumbnailPath)) {
        console.log(`    ✓ Vimeo thumbnail already exists: vimeo-${videoId}-thumb.jpg`);
        return;
      }
      
      thumbnailPromises.push(
        downloadFile(thumbnailUrl, thumbnailPath)
          .then(() => console.log(`    ✓ Downloaded Vimeo thumbnail: vimeo-${videoId}-thumb.jpg`))
          .catch((error) => console.error(`    ✗ Error downloading Vimeo thumbnail for ${videoId}:`, error.message))
      );
    });
  }
  
  if (project.youtubes && project.youtubes.length > 0) {
    project.youtubes.forEach((youtubeUrl) => {
      const videoId = getYouTubeId(youtubeUrl);
      if (!videoId) return;
      
      const thumbnailUrl = getYouTubeThumbnailUrl(videoId);
      const thumbnailPath = path.join(destImages, `youtube-${videoId}-thumb.jpg`);
      
      // Check if thumbnail already exists
      if (fs.existsSync(thumbnailPath)) {
        console.log(`    ✓ YouTube thumbnail already exists: youtube-${videoId}-thumb.jpg`);
        return;
      }
      
      thumbnailPromises.push(
        downloadFile(thumbnailUrl, thumbnailPath)
          .then(() => console.log(`    ✓ Downloaded YouTube thumbnail: youtube-${videoId}-thumb.jpg`))
          .catch((error) => console.error(`    ✗ Error downloading YouTube thumbnail for ${videoId}:`, error.message))
      );
    });
  }
  
  if (thumbnailPromises.length > 0) {
    await Promise.all(thumbnailPromises);
  }
}

// Helper function to extract Vimeo ID from URL
function getVimeoId(url) {
  const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
  return match ? match[1] : null;
}

// Helper function to extract YouTube ID from URL
function getYouTubeId(url) {
  // Handles various YouTube URL formats:
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Helper function to get YouTube embed URL
function getYouTubeEmbedUrl(url) {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

// Helper function to get YouTube thumbnail URL
function getYouTubeThumbnailUrl(videoId) {
  // YouTube provides thumbnails at: https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg
  // or https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg (smaller but more reliable)
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Helper function to download a file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

// Helper function to download YouTube thumbnail with fallback
async function downloadYouTubeThumbnail(videoId, destPath) {
  // Try maxresdefault first (highest quality), fall back to hqdefault if it fails
  const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  
  try {
    await downloadFile(maxResUrl, destPath);
    return;
  } catch (error) {
    // If maxresdefault fails (404), try hqdefault
    try {
      await downloadFile(hqUrl, destPath);
      return;
    } catch (fallbackError) {
      throw new Error(`Failed to download YouTube thumbnail: ${fallbackError.message}`);
    }
  }
}

// Copy assets (GIFs, etc.) to output
function copyAssets() {
  const destAssets = path.join(OUTPUT_DIR, 'assets');
  fs.mkdirSync(destAssets, { recursive: true });
  
  if (fs.existsSync(ASSETS_DIR)) {
    const assets = fs.readdirSync(ASSETS_DIR);
    assets.forEach(asset => {
      const sourcePath = path.join(ASSETS_DIR, asset);
      const destPath = path.join(destAssets, asset);
      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, destPath);
      }
    });
  }
}

// Generate project page HTML
function generateProjectPage(project) {
  // Helper function to get Vimeo embed URL
  function getVimeoEmbedUrl(url) {
    const id = getVimeoId(url);
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  
  // Collect all media items for carousel
  const carouselItems = [];
  
  // Add images
  project.images.forEach((img) => {
    const imageName = path.parse(img).name;
    carouselItems.push({
      type: 'image',
      src: `images/${imageName}.webp`,
      alt: project.title
    });
  });
  
  // Add PDFs
  if (project.pdfs && project.pdfs.length > 0) {
    project.pdfs.forEach((pdf) => {
      carouselItems.push({
        type: 'pdf',
        src: `images/${pdf}`
      });
    });
  }
  
  // Add Vimeo videos
  if (project.vimeos && project.vimeos.length > 0) {
    project.vimeos.forEach((vimeoUrl) => {
      const embedUrl = getVimeoEmbedUrl(vimeoUrl);
      if (embedUrl) {
        carouselItems.push({
          type: 'vimeo',
          src: embedUrl
        });
      }
    });
  }
  
  // Add YouTube videos
  if (project.youtubes && project.youtubes.length > 0) {
    project.youtubes.forEach((youtubeUrl) => {
      const embedUrl = getYouTubeEmbedUrl(youtubeUrl);
      if (embedUrl) {
        carouselItems.push({
          type: 'youtube',
          src: embedUrl
        });
      }
    });
  }
  
  // Generate carousel slides HTML
  const carouselSlides = carouselItems.map((item, index) => {
    if (item.type === 'image') {
      // Find the index in allMedia for popup
      const popupIndex = project.images.findIndex(img => {
        const imageName = path.parse(img).name;
        return item.src === `images/${imageName}.webp`;
      });
      return `        <div class="carousel-slide" data-index="${index}">
          <img src="${item.src}" alt="${item.alt}" onclick="openImagePopup('${item.src}', ${popupIndex >= 0 ? popupIndex : 0})" loading="lazy">
        </div>`;
    } else if (item.type === 'pdf') {
      return `        <div class="carousel-slide" data-index="${index}">
          <iframe src="${item.src}" type="application/pdf" class="carousel-pdf" loading="lazy"></iframe>
        </div>`;
    } else if (item.type === 'vimeo') {
      return `        <div class="carousel-slide" data-index="${index}">
          <iframe src="${item.src}" class="carousel-vimeo" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>`;
    } else if (item.type === 'youtube') {
      return `        <div class="carousel-slide" data-index="${index}">
          <iframe src="${item.src}" class="carousel-vimeo" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>`;
    }
    return '';
  }).filter(html => html !== '').join('\n');
  
  // Generate dot indicators
  const carouselDots = carouselItems.map((_, index) => {
    return `        <span class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="carouselGoTo(${index})"></span>`;
  }).join('\n');
  
  // Generate all media for popup navigation (images and PDFs only, videos excluded)
  const allMedia = [
    ...project.images.map(img => {
      const imageName = path.parse(img).name;
      return { type: 'image', src: `images/${imageName}.webp` };
    }),
    ...(project.pdfs || []).map(pdf => {
      return { type: 'pdf', src: `images/${pdf}` };
    })
  ];
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.title} - Portfolio</title>
  <link rel="stylesheet" href="../../style.css">
  <style>
    /* Carousel Styles */
    .carousel-container {
      position: relative;
      width: 100%;
      margin-bottom: 30px;
    }
    
    .carousel-wrapper {
      position: relative;
      width: 100%;
      overflow: hidden;
    }
    
    .carousel-track {
      display: flex;
      transition: transform 0.5s ease-in-out;
      will-change: transform;
      width: 100%;
    }
    
    .carousel-slide {
      width: 100%;
      min-width: 100%;
      max-width: 100%;
      flex-shrink: 0;
      flex-grow: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: calc(100vh - 200px);
      min-height: 500px;
      box-sizing: border-box;
    }
    
    .carousel-slide img {
      height: 100%;
      width: auto;
      max-width: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
      cursor: pointer;
      margin: 0 auto;
    }
    
    .carousel-pdf {
      width: 100%;
      height: 100%;
      display: block;
      border: none;
    }
    
    .carousel-vimeo {
      width: 100%;
      height: 100%;
      display: block;
      padding: 10px;
      box-sizing: border-box;
      border: none;
    }
    
    .carousel-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-top: 20px;
      width: 100%;
      flex-wrap: wrap;
    }
    
    .carousel-arrow {
      background-color: #F0F0F0;
      border: 3px outset #CCCCCC;
      font-size: 28pt;
      font-weight: bold;
      width: 70px;
      height: 50px;
      cursor: pointer;
      color: #000080;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .carousel-arrow:hover {
      background-color: #E0E0E0;
      border: 3px inset #CCCCCC;
      color: #FF0000;
    }
    
    .carousel-dots {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 0;
    }
    
    .carousel-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: #CCCCCC;
      border: 2px outset #CCCCCC;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    
    .carousel-dot:hover {
      background-color: #999999;
    }
    
    .carousel-dot.active {
      background-color: #000080;
      border: 2px inset #CCCCCC;
    }
  </style>
  <script>
    const allMedia = ${JSON.stringify(allMedia)};
    const carouselItems = ${JSON.stringify(carouselItems)};
    let currentCarouselIndex = 0;
    
    function updateCarousel() {
      const track = document.querySelector('.carousel-track');
      const dots = document.querySelectorAll('.carousel-dot');
      const totalSlides = carouselItems.length;
      
      if (!track || totalSlides === 0) return;
      
      // Update track position - ensure full 100% translation per slide
      const translateX = currentCarouselIndex * 100;
      track.style.transform = \`translateX(-\${translateX}%)\`;
      
      // Update dots
      dots.forEach((dot, index) => {
        if (index === currentCarouselIndex) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
    
    function carouselNext() {
      if (carouselItems.length === 0) return;
      currentCarouselIndex = (currentCarouselIndex + 1) % carouselItems.length;
      updateCarousel();
    }
    
    function carouselPrev() {
      if (carouselItems.length === 0) return;
      currentCarouselIndex = (currentCarouselIndex - 1 + carouselItems.length) % carouselItems.length;
      updateCarousel();
    }
    
    function carouselGoTo(index) {
      if (index >= 0 && index < carouselItems.length) {
        currentCarouselIndex = index;
        updateCarousel();
      }
    }
    
    // Keyboard navigation for carousel
    document.addEventListener('keydown', function(e) {
      const popup = document.getElementById('image-popup');
      if (popup && popup.style.display === 'block') {
        // If popup is open, handle popup navigation
        if (e.key === 'Escape') closePopup();
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'ArrowLeft') prevImage();
      } else {
        // Otherwise, handle carousel navigation
        if (e.key === 'ArrowLeft') carouselPrev();
        if (e.key === 'ArrowRight') carouselNext();
      }
    });
    
    function openImagePopup(src, index) {
      const popup = document.getElementById('image-popup');
      const popupContent = document.getElementById('popup-content');
      const popupImg = document.getElementById('popup-image');
      const popupPdf = document.getElementById('popup-pdf');
      const prevBtn = document.getElementById('popup-prev');
      const nextBtn = document.getElementById('popup-next');
      const closeBtn = document.getElementById('popup-close');
      
      currentIndex = index;
      updatePopup();
      popup.style.display = 'block';
    }
    
    let currentIndex = 0;
    
    function updatePopup() {
      const media = allMedia[currentIndex];
      const popupImg = document.getElementById('popup-image');
      const popupPdf = document.getElementById('popup-pdf');
      const popupVimeo = document.getElementById('popup-vimeo');
      const prevBtn = document.getElementById('popup-prev');
      const nextBtn = document.getElementById('popup-next');
      
      // Hide all media types first
      popupImg.style.display = 'none';
      popupPdf.style.display = 'none';
      popupVimeo.style.display = 'none';
      
      if (media.type === 'image') {
        popupImg.src = media.src;
        popupImg.style.display = 'block';
      } else if (media.type === 'pdf') {
        popupPdf.src = media.src;
        popupPdf.style.display = 'block';
      } else if (media.type === 'vimeo') {
        popupVimeo.src = media.src;
        popupVimeo.style.display = 'block';
      }
      
      prevBtn.style.display = currentIndex > 0 ? 'block' : 'none';
      nextBtn.style.display = currentIndex < allMedia.length - 1 ? 'block' : 'none';
    }
    
    function closePopup() {
      document.getElementById('image-popup').style.display = 'none';
    }
    
    function nextImage() {
      if (currentIndex < allMedia.length - 1) {
        currentIndex++;
        updatePopup();
      }
    }
    
    function prevImage() {
      if (currentIndex > 0) {
        currentIndex--;
        updatePopup();
      }
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      const popup = document.getElementById('image-popup');
      if (popup.style.display === 'block') {
        if (e.key === 'Escape') closePopup();
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'ArrowLeft') prevImage();
      }
    });
  </script>
</head>
<body>
  <div class="page-container project-page">
    <nav>
      <a href="../index.html">← Back to ${project.type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-')}</a>
    </nav>
    
    <main class="project">
      <header>
        <h1>${project.title}</h1>
        <div class="meta">
          <span class="type">${project.type}</span>
          <span class="date">${project.date}</span>
          ${project.materials && project.materials.trim() ? `<span class="materials">${project.materials}</span>` : ''}
        </div>
      </header>
      
      <div class="gallery">
        ${carouselItems.length > 0 ? (
          carouselItems.length === 1 ? 
            // Single item - no carousel needed
            carouselSlides
          :
            // Multiple items - show carousel
            `<div class="carousel-container">
        <div class="carousel-wrapper">
          <div class="carousel-track" style="transform: translateX(0%);">
${carouselSlides}
          </div>
        </div>
        <div class="carousel-controls">
          <button class="carousel-arrow carousel-prev" onclick="carouselPrev()">‹</button>
${carouselDots}
          <button class="carousel-arrow carousel-next" onclick="carouselNext()">›</button>
        </div>
      </div>`
        ) : '<p>No media available</p>'}
      </div>
      
      ${project.statement && project.statement.trim() ? `<div class="statement">
        ${project.statement}
      </div>` : ''}
    </main>
  </div>
  
  <!-- Image Popup -->
  <div id="image-popup" class="image-popup" onclick="if(event.target.id === 'image-popup') closePopup()">
    <div class="popup-content">
      <button id="popup-close" class="popup-close" onclick="closePopup()">✕</button>
      <button id="popup-prev" class="popup-nav popup-prev" onclick="prevImage()">‹</button>
      <button id="popup-next" class="popup-nav popup-next" onclick="nextImage()">›</button>
      <img id="popup-image" class="popup-media" alt="Enlarged view">
      <iframe id="popup-pdf" class="popup-media popup-pdf" style="display:none;"></iframe>
      <iframe id="popup-vimeo" class="popup-media popup-vimeo" style="display:none;" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
    </div>
  </div>
</body>
</html>`;

  const projectDir = path.join(OUTPUT_DIR, project.type, project.slug);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'index.html'), html);
}

// Generate index page HTML
function generateIndexPage(projects) {
  // Get unique project types
  const types = [...new Set(projects.map(p => p.type))].sort();
  
  // Generate type links list
  let typeLinks = '';
  types.forEach(type => {
    typeLinks += `        <li><a href="${type}/">${type.toUpperCase()}</a></li>\n`;
  });
  
  // Check if GIFs exist in assets folder
  const skeletonGifPath = path.join(ASSETS_DIR, HOMEPAGE_CONFIG.skeletonGifName);
  const flameGifPath = path.join(ASSETS_DIR, HOMEPAGE_CONFIG.flameGifName);
  const hasSkeletonGif = fs.existsSync(skeletonGifPath);
  const hasFlameGif = fs.existsSync(flameGifPath);
  
  let skeletonLeft = '';
  let skeletonRight = '';
  if (hasSkeletonGif) {
    skeletonLeft = `      <img src="assets/${HOMEPAGE_CONFIG.skeletonGifName}" alt="Skeleton" class="skeleton-art skeleton-left">`;
    skeletonRight = `      <img src="assets/${HOMEPAGE_CONFIG.skeletonGifName}" alt="Skeleton" class="skeleton-art skeleton-right">`;
  }
  
  let flameArt = '';
  if (hasFlameGif) {
    flameArt = `    <img src="assets/${HOMEPAGE_CONFIG.flameGifName}" alt="Flame" class="flame-art">`;
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portfolio</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="homepage-container">
    <div class="header-with-skeletons">
${skeletonLeft}
      <header class="site-header">
        <h1>${HOMEPAGE_CONFIG.title}</h1>
        <p class="flame-text">${HOMEPAGE_CONFIG.subtitle}</p>
      </header>
${skeletonRight}
    </div>
    
    <nav class="type-nav">
      <ul class="type-list">
${typeLinks}        <li><a href="about.html">ABOUT</a></li>
      </ul>
    </nav>
    
${flameArt}
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);
}

// Generate type index page (lists all projects of a type)
function generateTypeIndexPage(type, projects) {
  const typeProjects = projects.filter(p => p.type === type);
  
  let projectList = '';
  typeProjects.forEach(project => {
    let thumbnail = 'placeholder.webp';
    // Use first image, PDF, Vimeo, or YouTube for thumbnail (priority: image > PDF > Vimeo > YouTube)
    if (project.images && project.images.length > 0) {
      const mediaName = path.parse(project.images[0]).name;
      thumbnail = `${project.slug}/images/${mediaName}-thumb.webp`;
    } else if (project.pdfs && project.pdfs.length > 0) {
      const mediaName = path.parse(project.pdfs[0]).name;
      thumbnail = `${project.slug}/images/${mediaName}-thumb.webp`;
    } else if (project.vimeos && project.vimeos.length > 0) {
      // Use first Vimeo video thumbnail
      const firstVimeoUrl = Array.isArray(project.vimeos) ? project.vimeos[0] : project.vimeos;
      const videoId = getVimeoId(firstVimeoUrl);
      if (videoId) {
        thumbnail = `${project.slug}/images/vimeo-${videoId}-thumb.jpg`;
      }
    } else if (project.youtubes && project.youtubes.length > 0) {
      // Use first YouTube video thumbnail
      const firstYoutubeUrl = Array.isArray(project.youtubes) ? project.youtubes[0] : project.youtubes;
      const videoId = getYouTubeId(firstYoutubeUrl);
      if (videoId) {
        thumbnail = `${project.slug}/images/youtube-${videoId}-thumb.jpg`;
      }
    }
    projectList += `        <article class="project-card">
          <a href="${project.slug}/index.html">
            <img src="${thumbnail}" alt="${project.title}" loading="lazy">
            <h3>${project.title}</h3>
            <p class="date">${project.date}</p>
          </a>
        </article>\n`;
  });
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${type.toUpperCase()} - Portfolio</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <div class="page-container type-page">
    <nav>
      <a href="../index.html">← Back to Portfolio</a>
    </nav>
    
    <main class="type-content">
      <section class="type-section">
        <h2>${type.toUpperCase()}</h2>
        <div class="project-grid">
${projectList}        </div>
      </section>
    </main>
  </div>
</body>
</html>`;

  const typeDir = path.join(OUTPUT_DIR, type);
  fs.mkdirSync(typeDir, { recursive: true });
  fs.writeFileSync(path.join(typeDir, 'index.html'), html);
}

// Generate about page HTML
function generateAboutPage() {
  const aboutPath = './about.md';
  
  let aboutContent = '<p>No about content found. Create an <code>about.md</code> file in the project root.</p>';
  
  if (fs.existsSync(aboutPath)) {
    const aboutFile = fs.readFileSync(aboutPath, 'utf-8');
    const parsed = matter(aboutFile);
    aboutContent = marked(parsed.content);
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="page-container">
    <nav>
      <a href="index.html">← Back to Home</a>
    </nav>
    
    <main class="project">
      <div class="about-content">
        ${aboutContent}
      </div>
    </main>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'about.html'), html);
}

// Generate basic CSS
function generateCSS() {
  const c = DESIGN_CONFIG;
  const css = `html {
  box-sizing: border-box;
  overflow-x: hidden;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body {
  font-family: ${c.fonts.body};
  font-size: ${c.fontSize.body};
  line-height: 1.4;
  color: ${c.colors.text};
  background-color: ${c.colors.bg};
  margin: 20px auto;
  max-width: 800px;
  padding: 0 20px;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Homepage + interior page container - centered */
body:has(.homepage-container),
body:has(.page-container) {
  background-color: ${c.colors.homepageBg};
  margin: 0;
  padding: 40px 0;
  max-width: none;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow-x: hidden;
}

.homepage-container {
  width: ${c.homepageWidth};
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
  background-color: ${c.homepageBg};
  border: ${c.homepageBorder};
  padding: ${c.homepagePadding};
  box-sizing: border-box;
}

.page-container {
  width: ${c.homepageWidth};
  max-width: 100%;
  margin: 0 auto;
  background-color: ${c.homepageBg};
  border: ${c.homepageBorder};
  padding: ${c.homepagePadding};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
  text-align: left;
}

.page-container nav {
  width: 100%;
  align-self: stretch;
  margin: 0;
}

.type-page .type-content,
.project-page .project {
  border: 3px inset ${c.colors.headerBorder};
  background-color: ${c.homepageBg};
  padding: 20px;
  box-sizing: border-box;
}

/* Header with skeletons */
.header-with-skeletons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${c.skeletonGap};
  margin: 30px 0;
  flex-wrap: wrap;
  width: 100%;
}

/* ASCII Art / GIFs */
.skeleton-art {
  border: ${c.skeletonBorder};
  padding: ${c.skeletonPadding};
  background-color: ${c.colors.skeletonBg};
  width: ${c.skeletonWidth};
  height: auto;
  flex-shrink: 0;
}

.skeleton-right {
  transform: scaleX(-1);
}

.flame-art {
  margin: 20px auto;
  display: block;
  border: 2px inset ${c.colors.flameBorder};
  padding: 10px;
  background-color: ${c.colors.flameBg};
  max-width: 100%;
  height: auto;
}

/* Links - classic web 1.0 style */
a:link {
  color: ${c.colors.link};
  text-decoration: underline;
}

a:visited {
  color: ${c.colors.linkVisited};
  text-decoration: underline;
}

a:hover {
  color: ${c.colors.linkHover};
  text-decoration: underline;
  font-weight: bold;
}

a:active {
  color: ${c.colors.linkHover};
  text-decoration: underline;
}

/* Header */
.site-header {
  border: 4px outset ${c.colors.headerBorder};
  background-color: ${c.colors.headerBg};
  padding: 10px 20px;
  flex: 1;
  min-width: ${c.skeletonWidth};
  max-width: 100%;
  height: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  box-sizing: border-box;
}

.site-header h1 {
  font-size: clamp(14pt, 5vw, 48pt);
  font-weight: bold;
  margin-bottom: 5px;
  color: ${c.colors.headerText};
  text-shadow: 1px 1px 0px ${c.colors.headerBorder};
  word-wrap: break-word;
  line-height: 1.2;
  text-align: center;
}

.flame-text {
  font-size: clamp(9pt, min(2vw, 22pt), 24pt);
  color: ${c.colors.flameText};
  font-weight: bold;
  margin: 0 auto;
  white-space: nowrap;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  display: inline-block;
}

/* Type Navigation */
.type-nav {
  margin: 30px 0;
  width: 100%;
}

.type-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.type-list li {
  margin: 15px 0;
  border: 3px outset #CCCCCC;
  background-color: #F0F0F0;
  padding: 15px;
  display: block;
  max-width: 100%;
  box-sizing: border-box;
}

.type-list li:hover {
  border: 3px inset #CCCCCC;
  background-color: #E0E0E0;
}

.type-list a {
  font-size: ${c.fontSize.typeLinks};
  font-weight: bold;
  text-decoration: none;
  color: ${c.colors.headerText};
  display: block;
}

.type-list a:hover {
  color: ${c.colors.linkHover};
  text-decoration: underline;
}

/* Navigation */
nav {
  margin-bottom: 20px;
  padding: 10px;
  border: 2px inset #CCCCCC;
  background-color: #F5F5F5;
  text-align: center;
}

nav a {
  font-weight: bold;
}

/* Horizontal rule */
hr {
  border: none;
  border-top: 2px solid #000000;
  margin: 20px 0;
}

/* Type sections */
.type-section {
  margin-bottom: 40px;
  border: 2px outset #CCCCCC;
  padding: 15px;
  background-color: #FAFAFA;
}

.type-section h2 {
  font-size: ${c.fontSize.typeSection};
  font-weight: bold;
  margin-bottom: 15px;
  text-transform: capitalize;
  color: ${c.colors.headerText};
  border-bottom: 2px solid ${c.colors.text};
  padding-bottom: 5px;
}

/* Project grid - using table-like layout */
.project-grid {
  display: block;
}

.project-card {
  display: block;
  margin-bottom: 20px;
  border: 2px inset #CCCCCC;
  padding: 10px;
  background-color: #FFFFFF;
}

.project-card a {
  text-decoration: none;
  color: #000000;
}

.project-card img {
  width: 100%;
  border: 2px inset #CCCCCC;
  margin-bottom: 10px;
  display: block;
}

.project-card h3 {
  font-size: ${c.fontSize.projectCard};
  font-weight: bold;
  margin-bottom: 5px;
  color: ${c.colors.headerText};
}

.project-card h3 a {
  color: ${c.colors.headerText};
}

.project-card .date {
  color: #666666;
  font-size: 10pt;
  font-style: italic;
}

/* Project page */
.project header {
  margin-bottom: 20px;
  border: 3px outset #CCCCCC;
  background-color: #F0F0F0;
  padding: 15px;
}

.project h1 {
  font-size: ${c.fontSize.projectTitle};
  font-weight: bold;
  margin-bottom: 10px;
  color: ${c.colors.headerText};
}

.meta {
  display: block;
  margin-top: 10px;
  font-size: 11pt;
}

.meta span {
  display: inline-block;
  margin-right: 15px;
  padding: 3px 8px;
  border: 1px inset #CCCCCC;
  background-color: #FFFFFF;
}

.meta .type {
  text-transform: capitalize;
  font-weight: bold;
  color: #000000;
  background-color: #E0E0E0;
}

.gallery {
  margin-bottom: 30px;
}

.gallery img,
.gallery iframe {
  cursor: pointer;
}

.gallery img {
  width: 100%;
  border: 2px inset #CCCCCC;
  margin-bottom: 15px;
  display: block;
}

.gallery img:hover {
  border: 2px outset #CCCCCC;
}

.pdf-display {
  width: 100%;
  height: 800px;
  border: 2px inset #CCCCCC;
  margin-bottom: 15px;
  display: block;
  cursor: pointer;
}

.pdf-display:hover {
  border: 2px outset #CCCCCC;
}

.vimeo-item {
  width: 100%;
  margin-bottom: 15px;
}

.vimeo-thumbnail {
  width: 100%;
  border: 2px inset #CCCCCC;
  display: block;
  cursor: pointer;
}

.vimeo-thumbnail:hover {
  border: 2px outset #CCCCCC;
}

.vimeo-display {
  width: 100%;
  height: 600px;
  border: 2px inset #CCCCCC;
  margin-bottom: 15px;
  display: block;
  cursor: pointer;
  padding: 10px;
  box-sizing: border-box;
}

.vimeo-display:hover {
  border: 2px outset #CCCCCC;
}

/* Image Popup */
.image-popup {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  overflow: auto;
}

.popup-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  margin: 5vh auto;
  background-color: #FFFFFF;
  border: 4px outset #CCCCCC;
  padding: 20px;
}

.popup-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: #F0F0F0;
  border: 2px outset #CCCCCC;
  font-size: 24pt;
  font-weight: bold;
  width: 40px;
  height: 40px;
  cursor: pointer;
  z-index: 1001;
  color: #000000;
}

.popup-close:hover {
  background-color: #E0E0E0;
  border: 2px inset #CCCCCC;
}

.popup-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background-color: #F0F0F0;
  border: 3px outset #CCCCCC;
  font-size: 36pt;
  font-weight: bold;
  width: 60px;
  height: 60px;
  cursor: pointer;
  z-index: 1001;
  color: #000080;
  display: none;
}

.popup-prev {
  left: 10px;
}

.popup-next {
  right: 10px;
}

.popup-nav:hover {
  background-color: #E0E0E0;
  border: 3px inset #CCCCCC;
  color: #FF0000;
}

.popup-media {
  max-width: 100%;
  max-height: 85vh;
  display: block;
  margin: 0 auto;
  border: 2px inset #CCCCCC;
}

.popup-pdf {
  width: 100%;
  height: 85vh;
  border: 2px inset #CCCCCC;
}

.popup-vimeo {
  width: 100%;
  height: 85vh;
  border: 2px inset #CCCCCC;
  padding: 10px;
  box-sizing: border-box;
}

.statement {
  border: 2px inset #CCCCCC;
  padding: 15px;
  background-color: #FAFAFA;
  line-height: 1.6;
}

.statement p {
  margin-bottom: 12px;
  text-align: justify;
}

.statement h1, .statement h2, .statement h3 {
  color: ${c.colors.headerText};
  margin-top: 15px;
  margin-bottom: 10px;
}

.statement strong {
  font-weight: bold;
}

.statement em {
  font-style: italic;
}

.about-content {
  line-height: 1.6;
}

.about-content h1,
.about-content h2,
.about-content h3 {
  color: ${c.colors.headerText};
  margin-top: 20px;
  margin-bottom: 10px;
}

.about-content h1 {
  font-size: ${c.fontSize.headerH1};
  border-bottom: 2px solid ${c.colors.text};
  padding-bottom: 5px;
  text-align: center;
}

.about-content h2 {
  font-size: ${c.fontSize.typeSection};
  border-bottom: 1px solid ${c.colors.headerBorder};
  padding-bottom: 3px;
}

.about-content h3 {
  font-size: ${c.fontSize.projectTitle};
}

.about-content p {
  margin-bottom: 15px;
}

.about-content ul,
.about-content ol {
  margin-bottom: 15px;
  padding-left: 30px;
}

.about-content li {
  margin-bottom: 5px;
}

.about-content a {
  color: ${c.colors.link};
  text-decoration: underline;
}

.about-content a:hover {
  color: ${c.colors.linkHover};
}

.about-content code {
  background-color: ${c.colors.headerBg};
  padding: 2px 4px;
  border: 1px solid ${c.colors.headerBorder};
  font-family: ${c.fonts.monospace};
  font-size: 0.9em;
}

/* Mobile Responsive Styles */
@media (max-width: 768px) {
  /* Hide skeletons and flame on mobile */
  .skeleton-art,
  .flame-art {
    display: none;
  }

  /* Make header full width on mobile */
  .header-with-skeletons {
    flex-direction: column;
    gap: 10px;
  }

  .site-header {
    width: 100%;
    min-width: unset;
  }

  /* Adjust homepage container for mobile */
  .homepage-container,
  .page-container {
    width: calc(100vw - 20px);
    max-width: 100%;
    padding: 15px;
  }

  /* Make type links more touch-friendly */
  .type-list li {
    padding: 20px;
    margin: 10px 0;
  }

  .type-list a {
    font-size: 16pt;
  }

  /* Adjust text sizes for mobile */
  .site-header h1 {
    font-size: clamp(18pt, 8vw, 32pt);
  }

  .flame-text {
    font-size: clamp(10pt, 3.5vw, 18pt);
    white-space: nowrap;
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  /* Extra small screens */
  .homepage-container,
  .page-container {
    width: 100%;
    max-width: 100%;
    padding: 10px;
    border: none;
  }

  body:has(.homepage-container),
  body:has(.page-container) {
    padding: 0;
    overflow-x: hidden;
  }

  .site-header {
    padding: 8px 15px;
  }

  .type-list a {
    font-size: 14pt;
  }
}
`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'style.css'), css);
}

// Main build function
async function build() {
  console.log('🔨 Building portfolio...\n');
  
  const projects = getAllProjects();
  console.log(`Found ${projects.length} projects\n`);
  
  // Generate each project page and optimize images
  for (const project of projects) {
    console.log(`  Processing ${project.type}/${project.slug}...`);
    await optimizeProjectImages(project);
    generateProjectPage(project);
  }
  
  // Copy assets (GIFs, etc.)
  copyAssets();
  
  // Generate index page
  generateIndexPage(projects);
  
  // Generate type index pages
  const types = [...new Set(projects.map(p => p.type))];
  types.forEach(type => {
    generateTypeIndexPage(type, projects);
  });
  
  // Generate about page
  generateAboutPage();
  
  // Generate CSS
  generateCSS();
  
  console.log('\n✨ Build complete! Check the output/ folder\n');
}

// Sync test.html changes back to build.js config
function syncFromTest() {
  const TEST_FILE = './test.html';
  
  if (!fs.existsSync(TEST_FILE)) {
    console.log('❌ test.html not found. Create it first!');
    return;
  }
  
  console.log('🔄 Syncing from test.html to build.js...\n');
  
  const testContent = fs.readFileSync(TEST_FILE, 'utf-8');
  const BUILD_FILE = './build.js';
  const buildContent = fs.readFileSync(BUILD_FILE, 'utf-8');
  
  // Extract CSS from test.html
  const cssMatch = testContent.match(/<style>([\s\S]*?)<\/style>/);
  if (!cssMatch) {
    console.log('❌ Could not find <style> tag in test.html');
    return;
  }
  
  const css = cssMatch[1];
  let updated = buildContent;
  let changesCount = 0;
  
  // Helper to extract CSS value before a comment
  function extractValue(property, commentPattern) {
    const regex = new RegExp(`${property}:\\s*([^;]+?)\\s*;\\s*\\/\\*\\s*${commentPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*\\/`, 'i');
    const match = css.match(regex);
    if (match) {
      // Clean up the value - remove extra whitespace, handle quotes
      let value = match[1].trim();
      // If it's already quoted, keep it; otherwise add quotes if needed
      if (!value.match(/^['"]/)) {
        // Check if it's a color, size, etc that might need quotes
        if (value.includes(' ') || value.includes(',')) {
          value = `"${value}"`;
        }
      }
      return value;
    }
    return null;
  }
  
  // Sync simple config values
  const simpleMappings = [
    { cssProp: 'width', configPath: 'homepageWidth', comment: 'DESIGN_CONFIG\\.homepageWidth' },
    { cssProp: 'padding', configPath: 'homepagePadding', comment: 'DESIGN_CONFIG\\.homepagePadding', selector: '.homepage-container' },
    { cssProp: 'border', configPath: 'homepageBorder', comment: 'DESIGN_CONFIG\\.homepageBorder', selector: '.homepage-container' },
    { cssProp: 'background-color', configPath: 'homepageBg', comment: 'DESIGN_CONFIG\\.homepageBg', selector: '.homepage-container' },
    { cssProp: 'gap', configPath: 'skeletonGap', comment: 'DESIGN_CONFIG\\.skeletonGap' },
    { cssProp: 'width', configPath: 'skeletonWidth', comment: 'DESIGN_CONFIG\\.skeletonWidth', selector: '.skeleton-art' },
    { cssProp: 'padding', configPath: 'skeletonPadding', comment: 'DESIGN_CONFIG\\.skeletonPadding', selector: '.skeleton-art' },
    { cssProp: 'border', configPath: 'skeletonBorder', comment: 'DESIGN_CONFIG\\.skeletonBorder', selector: '.skeleton-art' },
  ];
  
  for (const mapping of simpleMappings) {
    let searchPattern = mapping.selector 
      ? `${mapping.selector}\\s*{[^}]*${mapping.cssProp}:\\s*([^;]+?)\\s*;`
      : `${mapping.cssProp}:\\s*([^;]+?)\\s*;\\s*\\/\\*\\s*${mapping.comment}`;
    
    const regex = new RegExp(searchPattern, 'is');
    const match = css.match(regex);
    if (match) {
      let value = match[1].trim();
      // Add quotes if not already quoted and contains special chars
      if (!value.match(/^['"]/) && (value.includes(' ') || value.includes('#'))) {
        value = `'${value}'`;
      }
      
      // Update in build.js
      const configRegex = new RegExp(`(${mapping.configPath}:\\s*)['"]?[^'",\\n]+['"]?`, 'i');
      if (configRegex.test(updated)) {
        updated = updated.replace(configRegex, `$1${value}`);
        changesCount++;
        console.log(`  ✓ Updated ${mapping.configPath}: ${value}`);
      }
    }
  }
  
  // Sync colors
  const colorMappings = [
    { cssProp: 'color', configPath: 'colors.text', comment: 'DESIGN_CONFIG\\.colors\\.text', selector: 'body' },
    { cssProp: 'background-color', configPath: 'colors.bg', comment: 'DESIGN_CONFIG\\.colors\\.bg', selector: 'body' },
    { cssProp: 'background-color', configPath: 'colors.homepageBg', comment: 'DESIGN_CONFIG\\.colors\\.homepageBg', selector: 'body:has\\(\\.homepage-container\\)' },
    { cssProp: 'background-color', configPath: 'colors.headerBg', comment: 'DESIGN_CONFIG\\.colors\\.headerBg', selector: '\\.site-header' },
    { cssProp: 'border', configPath: 'colors.headerBorder', comment: 'DESIGN_CONFIG\\.colors\\.headerBorder', selector: '\\.site-header' },
    { cssProp: 'color', configPath: 'colors.link', comment: 'DESIGN_CONFIG\\.colors\\.link', selector: 'a:link' },
    { cssProp: 'color', configPath: 'colors.linkVisited', comment: 'DESIGN_CONFIG\\.colors\\.linkVisited', selector: 'a:visited' },
    { cssProp: 'color', configPath: 'colors.linkHover', comment: 'DESIGN_CONFIG\\.colors\\.linkHover', selector: 'a:hover' },
    { cssProp: 'color', configPath: 'colors.headerText', comment: 'DESIGN_CONFIG\\.colors\\.headerText', selector: '\\.site-header h1' },
    { cssProp: 'color', configPath: 'colors.flameText', comment: 'DESIGN_CONFIG\\.colors\\.flameText', selector: '\\.flame-text' },
    { cssProp: 'background-color', configPath: 'colors.skeletonBg', comment: 'DESIGN_CONFIG\\.colors\\.skeletonBg', selector: '\\.skeleton-art' },
    { cssProp: 'background-color', configPath: 'colors.flameBg', comment: 'DESIGN_CONFIG\\.colors\\.flameBg', selector: '\\.flame-art' },
    { cssProp: 'border', configPath: 'colors.flameBorder', comment: 'DESIGN_CONFIG\\.colors\\.flameBorder', selector: '\\.flame-art' },
  ];
  
  for (const mapping of colorMappings) {
    const searchPattern = `${mapping.selector}\\s*{[^}]*${mapping.cssProp}:\\s*([^;]+?)\\s*;`;
    const regex = new RegExp(searchPattern, 'is');
    const match = css.match(regex);
    if (match) {
      let value = match[1].trim();
      // Extract just the color value (might be part of a border declaration)
      if (mapping.cssProp === 'border') {
        const colorMatch = value.match(/#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}/);
        if (colorMatch) value = colorMatch[0];
        else if (value.includes('outset') || value.includes('inset')) {
          const parts = value.split(/\s+/);
          value = parts[parts.length - 1]; // Get last part (the color)
        }
      }
      
      if (value && value.match(/^#/)) {
        const [parent, child] = mapping.configPath.split('.');
        const configRegex = new RegExp(`(${parent}:\\s*{[^}]*${child}:\\s*)['"]?[^'",\\n]+['"]?`, 'i');
        if (configRegex.test(updated)) {
          updated = updated.replace(configRegex, `$1'${value}'`);
          changesCount++;
          console.log(`  ✓ Updated ${mapping.configPath}: ${value}`);
        }
      }
    }
  }
  
  // Sync font sizes
  const fontSizeMappings = [
    { cssProp: 'font-size', configPath: 'fontSize.body', comment: 'DESIGN_CONFIG\\.fontSize\\.body', selector: 'body' },
    { cssProp: 'font-size', configPath: 'fontSize.headerH1', comment: 'DESIGN_CONFIG\\.fontSize\\.headerH1', selector: '\\.site-header h1' },
    { cssProp: 'font-size', configPath: 'fontSize.headerSubtitle', comment: 'DESIGN_CONFIG\\.fontSize\\.headerSubtitle', selector: '\\.flame-text' },
    { cssProp: 'font-size', configPath: 'fontSize.typeLinks', comment: 'DESIGN_CONFIG\\.fontSize\\.typeLinks', selector: '\\.type-list a' },
    { cssProp: 'font-size', configPath: 'fontSize.typeSection', comment: 'DESIGN_CONFIG\\.fontSize\\.typeSection', selector: '\\.type-section h2' },
    { cssProp: 'font-size', configPath: 'fontSize.projectTitle', comment: 'DESIGN_CONFIG\\.fontSize\\.projectTitle', selector: '\\.project h1' },
    { cssProp: 'font-size', configPath: 'fontSize.projectCard', comment: 'DESIGN_CONFIG\\.fontSize\\.projectCard', selector: '\\.project-card h3' },
  ];
  
  for (const mapping of fontSizeMappings) {
    const searchPattern = `${mapping.selector}\\s*{[^}]*${mapping.cssProp}:\\s*([^;]+?)\\s*;`;
    const regex = new RegExp(searchPattern, 'is');
    const match = css.match(regex);
    if (match) {
      let value = match[1].trim();
      const [parent, child] = mapping.configPath.split('.');
      const configRegex = new RegExp(`(${parent}:\\s*{[^}]*${child}:\\s*)['"]?[^'",\\n]+['"]?`, 'i');
      if (configRegex.test(updated)) {
        updated = updated.replace(configRegex, `$1'${value}'`);
        changesCount++;
        console.log(`  ✓ Updated ${mapping.configPath}: ${value}`);
      }
    }
  }
  
  // Sync fonts
  const fontMappings = [
    { cssProp: 'font-family', configPath: 'fonts.body', comment: 'DESIGN_CONFIG\\.fonts\\.body', selector: 'body' },
    { cssProp: 'font-family', configPath: 'fonts.monospace', comment: 'DESIGN_CONFIG\\.fonts\\.monospace', selector: '\\.skeleton-art pre' },
  ];
  
  for (const mapping of fontMappings) {
    const searchPattern = `${mapping.selector}\\s*{[^}]*${mapping.cssProp}:\\s*([^;]+?)\\s*;`;
    const regex = new RegExp(searchPattern, 'is');
    const match = css.match(regex);
    if (match) {
      let value = match[1].trim();
      const [parent, child] = mapping.configPath.split('.');
      const configRegex = new RegExp(`(${parent}:\\s*{[^}]*${child}:\\s*)['"]?[^'",\\n]+['"]?`, 'i');
      if (configRegex.test(updated)) {
        updated = updated.replace(configRegex, `$1${value}`);
        changesCount++;
        console.log(`  ✓ Updated ${mapping.configPath}: ${value}`);
      }
    }
  }
  
  // Extract title and subtitle from HTML
  const titleMatch = testContent.match(/<h1>([^<]+)<\/h1>/);
  const subtitleMatch = testContent.match(/<p class="flame-text">([^<]+)<\/p>/);
  
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const titleRegex = /(title:\s*)['"][^'"]+['"]/;
    if (titleRegex.test(updated)) {
      updated = updated.replace(titleRegex, `$1'${title}'`);
      changesCount++;
      console.log(`  ✓ Updated HOMEPAGE_CONFIG.title: ${title}`);
    }
  }
  
  if (subtitleMatch) {
    const subtitle = subtitleMatch[1].trim();
    const subtitleRegex = /(subtitle:\s*)['"][^'"]+['"]/;
    if (subtitleRegex.test(updated)) {
      updated = updated.replace(subtitleRegex, `$1'${subtitle}'`);
      changesCount++;
      console.log(`  ✓ Updated HOMEPAGE_CONFIG.subtitle: ${subtitle}`);
    }
  }
  
  // Write updated build.js
  if (changesCount > 0) {
    fs.writeFileSync(BUILD_FILE, updated);
    console.log(`\n✨ Synced ${changesCount} changes from test.html to build.js`);
    console.log('   Run "node build.js" to rebuild with new settings!\n');
  } else {
    console.log('\n✨ No changes detected (test.html matches current config)');
  }
}

// Check command line argument
const args = process.argv.slice(2);
if (args.includes('--sync') || args.includes('-s')) {
  syncFromTest();
} else {
  // Run the build
  build();
}
