let fileList = [];
let currentTitle = 'downloaded-files';

document.addEventListener('DOMContentLoaded', function() {
    const scanBtn = document.getElementById('scanBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusDiv = document.getElementById('status');
    const fileListDiv = document.getElementById('imageList');

    scanBtn.addEventListener('click', async function() {
        showStatus('Scanning for files...', 'info');
        scanBtn.disabled = true;
        downloadBtn.disabled = true;
        fileListDiv.style.display = 'none';
        fileListDiv.innerHTML = '';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Get page title and extract files
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractFilesAndTitle
            });

            const result = results[0].result;
            fileList = result.files; // Now contains objects {url, originalName}

            // Sort files by "q" number (q1, q2, q3...) if present in the filename
            fileList.sort((a, b) => {
                const getQNumber = (fileObj) => {
                    try {
                        // Try to get Q number from original name first
                        let nameToCheck = fileObj.originalName || '';

                        // If no original name, try URL
                        if (!nameToCheck) {
                            const urlObj = new URL(fileObj.url);
                            const pathname = urlObj.pathname;
                            const parts = pathname.split('/');
                            nameToCheck = parts.pop() || parts.pop();
                        }

                        // Look for q followed by digits (e.g., q1, q23)
                        const qMatch = nameToCheck.match(/q(\d+)/i);
                        if (qMatch) {
                            return parseInt(qMatch[1], 10);
                        }
                    } catch (e) {
                        console.error('Error parsing for sorting:', e);
                    }
                    return Infinity; // Put non-matching items at the end
                };

                const qA = getQNumber(a);
                const qB = getQNumber(b);

                if (qA === Infinity && qB === Infinity) return 0;
                return qA - qB;
            });

            // Set title from page title
            if (result.title) {
                currentTitle = result.title;
            }

            if (fileList.length === 0) {
                showStatus('No files found in attachment list', 'error');
                downloadBtn.disabled = true;
            } else {
                showStatus(`Found ${fileList.length} file(s)`, 'success');
                downloadBtn.disabled = false;

                // Display file list
                fileListDiv.innerHTML = fileList.map((file, index) =>
                    `<div class="file-item">${index + 1}. ${getFileName(file, index)}</div>`
                ).join('');
                fileListDiv.style.display = 'block';
            }
        } catch (error) {
            showStatus('Error: ' + error.message, 'error');
        } finally {
            scanBtn.disabled = false;
        }
    });

    downloadBtn.addEventListener('click', async function() {
        let folderName = currentTitle.trim() || 'downloaded-files';
        
        // Sanitize filename again to be safe
        folderName = folderName.replace(/[<>:"\/\\|?*]/g, "").trim();
        if (!folderName) folderName = 'downloaded-files';

        if (fileList.length === 0) {
            showStatus('No files to download. Please scan first.', 'error');
            return;
        }

        downloadBtn.disabled = true;
        showStatus(`Preparing ZIP file with ${fileList.length} file(s)...`, 'info');

        try {
            // Check if JSZip is loaded
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip library not loaded. Please restart the extension.');
            }

            const zip = new JSZip();
            let successCount = 0;

            for (let i = 0; i < fileList.length; i++) {
                try {
                    const fileObj = fileList[i];
                    const filename = getFileName(fileObj, i);

                    showStatus(`Fetching file ${i + 1}/${fileList.length}...`, 'info');

                    const response = await fetch(fileObj.url);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const blob = await response.blob();

                    zip.file(filename, blob);
                    successCount++;
                } catch (error) {
                    console.error('Fetch error:', error);
                }
            }

            if (successCount === 0) {
                throw new Error('Failed to fetch any files for ZIP.');
            }

            showStatus('Generating ZIP file...', 'info');
            const content = await zip.generateAsync({
                type: "blob"
            });
            const zipUrl = URL.createObjectURL(content);
            
            // Use a subfolder to ensure filename is respected and avoid conflicts
            const zipFilename = `Fuo_Downloads/${folderName}.zip`;

            showStatus(`Saving as: ${zipFilename}...`, 'info');

            await chrome.downloads.download({
                url: zipUrl,
                filename: zipFilename,
                saveAs: false,
                conflictAction: 'uniquify'
            });

            showStatus(`✓ Successfully created ZIP with ${successCount} files`, 'success');

            // Clean up
            setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);

        } catch (error) {
            showStatus('Error creating ZIP: ' + error.message, 'error');
        } finally {
            downloadBtn.disabled = false;
        }
    });
});

// Function to extract files and title from the page
function extractFilesAndTitle() {
    const files = [];
    const uniqueUrls = new Set();

    // Target specifically the attachment list to avoid extra files
    // and capture both images and other files (zip, rar, etc.)
    const attachmentItems = document.querySelectorAll('.attachmentList .file--linked');

    if (attachmentItems.length > 0) {
        attachmentItems.forEach(li => {
            const link = li.querySelector('a[href*="/attachments/"]');
            if (!link) return;

            const href = link.href;
            if (uniqueUrls.has(href)) return;
            uniqueUrls.add(href);

            // Try to get the real filename from the UI
            let name = '';
            const nameElement = li.querySelector('.file-name');
            if (nameElement) {
                name = nameElement.textContent.trim() || nameElement.getAttribute('title');
            }

            files.push({
                url: href,
                originalName: name
            });
        });
    } else {
        // Fallback for pages that might not have the standard structure
        document.querySelectorAll('a[href*="/attachments/"]').forEach(a => {
            const href = a.href;
            if (!uniqueUrls.has(href)) {
                uniqueUrls.add(href);
                files.push({
                    url: href,
                    originalName: ''
                });
            }
        });
    }

    // Extract page title
    let pageTitle = '';

    // Try to get title from h1.p-title-value (main thread title)
    const titleElement = document.querySelector('h1.p-title-value');
    if (titleElement) {
        // Remove label elements and get clean text
        const clonedTitle = titleElement.cloneNode(true);
        const labels = clonedTitle.querySelectorAll('.label');
        labels.forEach(label => label.remove());
        pageTitle = clonedTitle.textContent.trim();
    }

    // Fallback to document title if not found
    if (!pageTitle) {
        pageTitle = document.title.split(' | ')[0].trim();
    }

    // Clean up title for folder name
    pageTitle = pageTitle
        .replace(/[<>:"\/\\|?*]/g, '') // Remove invalid characters
        .trim()
        .substring(0, 100); // Limit length

    return {
        files: files,
        title: pageTitle || 'downloaded-files'
    };
}

function getFileName(fileObj, index) {
    try {
        let filename = '';

        // Use original name if available (extracted from DOM)
        if (fileObj.originalName) {
            filename = fileObj.originalName;
        } else {
            // Fallback to URL parsing
            const urlObj = new URL(fileObj.url);
            let pathname = urlObj.pathname;
            const pathParts = pathname.split('/').filter(p => p);
            filename = pathParts[pathParts.length - 1];
            filename = filename.split('?')[0];

            if (/^\d+$/.test(filename) && pathParts.length > 1) {
                filename = pathParts[pathParts.length - 2];
            }
        }

        // Clean up filename but keep extension
        // Split extension
        const lastDotIndex = filename.lastIndexOf('.');
        let namePart = filename;
        let extension = '';

        if (lastDotIndex !== -1 && lastDotIndex > 0) {
            namePart = filename.substring(0, lastDotIndex);
            extension = filename.substring(lastDotIndex);
        } else {
            // Try to guess extension if missing
            if (filename.includes('-webp')) extension = '.webp';
            else if (filename.includes('-jpg')) extension = '.jpg';
            else if (filename.includes('-png')) extension = '.png';
            else extension = '.jpg'; // Default
        }

        // Clean name part
        namePart = namePart.replace(/[^a-zA-Z0-9_-]/g, '_');

        // Add index to ensure uniqueness and correct order
        return `${String(index + 1).padStart(3, '0')}_${namePart}${extension}`;
    } catch (error) {
        return `file_${String(index + 1).padStart(3, '0')}.dat`;
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = type;
}