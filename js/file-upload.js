/* ========================================
   SYSTÈME D'UPLOAD DE FICHIERS
   ======================================== */

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_FILE_SIZE = Number.POSITIVE_INFINITY; // no client-side limit
// Passer en upload résumable pour les gros fichiers (ex: vidéos iPhone)
const RESUMABLE_THRESHOLD_BYTES = 45 * 1024 * 1024; // 45 Mo ~ limite CDN courante
const RESUMABLE_CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 Mo par chunk

// Uploader un fichier vers Supabase Storage
function isGifFile(file) {
    if (!file) return false;
    if (file.type === "image/gif") return true;
    if (typeof file.name === "string") {
        return file.name.toLowerCase().endsWith(".gif");
    }
    return false;
}

function isAllowedImageFile(file) {
    if (!file) return false;
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) return true;
    const name = (file.name || "").toLowerCase();
    return (
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".png") ||
        name.endsWith(".gif") ||
        name.endsWith(".webp") ||
        name.endsWith(".heic") ||
        name.endsWith(".heif")
    );
}

async function uploadFile(file, folder = "content", onProgress) {
    try {
        // Validation du type de fichier
        const isGif = isGifFile(file);
        const isImage = isAllowedImageFile(file) || isGif;
        const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

        if (!isImage && !isVideo) {
                throw new Error(
                    "Type de fichier non supporté. Utilisez JPG, PNG, GIF, WebP, HEIC, HEIF, MP4 ou WebM.",
                );
        }

        // Validation de la taille
        if (file.size > MAX_FILE_SIZE) {
            throw new Error("Fichier trop volumineux.");
        }

        // Vérifier que l'utilisateur est connecté (PWA: currentUser peut être non hydraté)
        if (!window.currentUser) {
            try {
                const { data, error } = await supabase?.auth?.getUser?.();
                if (!error && data?.user) {
                    window.currentUser = data.user;
                    window.currentUserId = data.user.id;
                }
            } catch (e) {
                // ignore
            }
        }
        if (!window.currentUser) {
            throw new Error("Utilisateur non connecté. Reconnectez-vous.");
        }

        // Générer un nom de fichier unique
        const fileExt = file.name.split(".").pop();
        const fileName = `${window.currentUser.id}/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const supportsResumable =
            typeof supabase?.storage?.from("media")?.uploadResumable ===
            "function";
        const useResumable =
            supportsResumable &&
            (file.size >= RESUMABLE_THRESHOLD_BYTES || isVideo);

        const baseFileOptions = {
            cacheControl: isGif ? "0" : "3600",
            contentType: file.type || undefined,
            upsert: false,
        };

        const notifyProgress = (progressEvent) => {
            if (!progressEvent) return;

            // Gestion de plusieurs formats possibles d'évènement de progression
            const uploadedBytes =
                progressEvent.bytesUploaded ||
                progressEvent.uploadedBytes ||
                progressEvent.loaded ||
                0;
            const totalBytes =
                progressEvent.bytesTotal ||
                progressEvent.totalBytes ||
                progressEvent.total ||
                file.size;

            if (!totalBytes || !uploadedBytes) return;
            const percent = Math.min(
                100,
                Math.round((uploadedBytes / totalBytes) * 100),
            );

            if (typeof onProgress === "function") {
                onProgress(percent);
            } else if (typeof showUploadProgress === "function") {
                showUploadProgress(uploadedBytes, totalBytes);
            }
        };

        let uploadResponse;

        if (useResumable) {
            uploadResponse = await supabase.storage
                .from("media")
                .uploadResumable(
                    fileName,
                    file,
                    baseFileOptions,
                    {
                        chunkSize: RESUMABLE_CHUNK_SIZE_BYTES,
                        onUploadProgress: notifyProgress,
                    },
                );
        } else {
            uploadResponse = await supabase.storage
                .from("media")
                .upload(fileName, file, baseFileOptions);
        }

        const { data, error } = uploadResponse || {};

        if (error) {
            console.error("Erreur détaillée upload:", error);

            // Messages d'erreur plus spécifiques
            if (error.statusCode === 400) {
                throw new Error(
                    "Fichier invalide ou bucket media non configure. Executez sql/storage-init.sql dans Supabase puis reessayez.",
                );
            } else if (error.statusCode === 401) {
                throw new Error("Non autorisé. Vérifiez votre connexion.");
            } else if (error.statusCode === 413) {
                throw new Error("Fichier trop volumineux.");
            }

            throw new Error(
                error.message || "Erreur inconnue lors de l'upload",
            );
        }

        // Récupérer l'URL publique
        const {
            data: { publicUrl },
        } = supabase.storage.from("media").getPublicUrl(fileName);

        return {
            success: true,
            url: publicUrl,
            path: fileName,
            type: isImage ? "image" : "video",
        };
    } catch (error) {
        console.error("Erreur upload:", error);
        return {
            success: false,
            error: error.message,
        };
    }
}

// Uploader plusieurs fichiers
async function uploadMultipleFiles(
    files,
    folder = "content",
    onProgress = null,
) {
    const results = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await uploadFile(file, folder);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, files.length);
        }
    }

    return results;
}

// Supprimer un fichier de Supabase Storage
async function deleteFile(filePath) {
    try {
        const { error } = await supabase.storage
            .from("media")
            .remove([filePath]);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error("Erreur suppression:", error);
        return { success: false, error: error.message };
    }
}

// Créer un aperçu d'image
function createImagePreview(file, callback) {
    const reader = new FileReader();

    reader.onload = (e) => {
        callback(e.target.result);
    };

    reader.readAsDataURL(file);
}

// Compresser une image avant upload
async function compressImage(file, maxWidth = 1920, quality = 0.8) {
    if (isGifFile(file)) {
        return file;
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                // Redimensionner si nécessaire
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error("Impossible de compresser l'image."));
                            return;
                        }
                        const compressedFile = new File([blob], file.name, {
                            type: "image/jpeg",
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    },
                    "image/jpeg",
                    quality,
                );
            };

            img.onerror = reject;
            img.src = e.target.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Initialiser un input de fichier avec drag & drop
function initializeFileInput(inputId, options = {}) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const dropZone = options.dropZone || input.parentElement;
    const preview = options.preview;
    const onUpload = options.onUpload;
    const onUploadBatch = options.onUploadBatch;
    const onBeforeUpload = options.onBeforeUpload;
    const onAfterUpload = options.onAfterUpload;
    const resolveMultiple = () =>
        typeof options.multiple === "function"
            ? !!options.multiple()
            : !!options.multiple;
    const compress = options.compress || false;
    const validate = options.validate;

    // Gérer la sélection de fichiers
    input.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const allowMultiple = resolveMultiple();
        const chosen = allowMultiple ? files : files.slice(0, 1);
        const uploaded = await handleFileSelection(chosen, preview, onUpload, compress, {
            validate,
            onBeforeUpload,
            onAfterUpload,
        });
        input.value = "";

        if (typeof onUploadBatch === "function") {
            try {
                onUploadBatch(uploaded);
            } catch (err) {
                console.error("Erreur onUploadBatch:", err);
            }
        }
    });

    // Gérer le drag & drop
    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("drag-over");
        });

        dropZone.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropZone.classList.remove("drag-over");

            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;

            const allowMultiple = resolveMultiple();
            const chosen = allowMultiple ? files : files.slice(0, 1);
            const uploaded = await handleFileSelection(chosen, preview, onUpload, compress, {
                validate,
                onBeforeUpload,
                onAfterUpload,
            });

            if (typeof onUploadBatch === "function") {
                try {
                    onUploadBatch(uploaded);
                } catch (err) {
                    console.error("Erreur onUploadBatch:", err);
                }
            }
        });
    }
}

// Gérer la sélection de fichiers
async function handleFileSelection(
    files,
    preview,
    onUpload,
    compress,
    options = {},
) {
    const uploadedFiles = [];
    const validate = options.validate;
    const onBeforeUpload = options.onBeforeUpload;
    const onAfterUpload = options.onAfterUpload;

    for (const file of files) {
        if (typeof validate === "function") {
            const validation = validate(file);
            if (validation === false) {
                notifyUploadError("Fichier non autorisé.");
                continue;
            }
            if (typeof validation === "string") {
                notifyUploadError(validation);
                continue;
            }
            if (validation && validation.valid === false) {
                notifyUploadError(validation.error || "Fichier non autorisé.");
                continue;
            }
        }

        // Afficher l'aperçu si demandé
        if (preview && isAllowedImageFile(file)) {
            createImagePreview(file, (dataUrl) => {
                if (typeof preview === "function") {
                    preview(dataUrl);
                } else if (typeof preview === "string") {
                    const previewElement = document.getElementById(preview);
                    if (previewElement) {
                        previewElement.src = dataUrl;
                    }
                }
            });
        }

        // Compresser l'image si demandé
        let fileToUpload = file;
        const shouldCompress =
            compress &&
            isAllowedImageFile(file) &&
            !isGifFile(file);
        if (shouldCompress) {
            try {
                fileToUpload = await compressImage(file);
            } catch (error) {
                console.error("Erreur compression:", error);
            }
        }

        // Uploader le fichier
        if (typeof onBeforeUpload === "function") {
            try {
                onBeforeUpload(fileToUpload);
            } catch (e) {
                console.error("Erreur onBeforeUpload:", e);
            }
        }
        let result;
        try {
            result = await uploadFile(fileToUpload);
        } finally {
            if (typeof onAfterUpload === "function") {
                try {
                    onAfterUpload();
                } catch (e) {
                    console.error("Erreur onAfterUpload:", e);
                }
            }
        }
        uploadedFiles.push(result);

        // Callback après upload
        if (onUpload) {
            onUpload(result);
        }
    }

    return uploadedFiles;
}

function notifyUploadError(message) {
    if (
        window.ToastManager &&
        typeof window.ToastManager.error === "function"
    ) {
        window.ToastManager.error("Erreur", message);
        return;
    }
    alert("Erreur: " + message);
}

// Afficher une barre de progression d'upload
function showUploadProgress(current, total) {
    const progressBar = document.getElementById("upload-progress");
    if (!progressBar) return;

    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${current}/${total}`;

    if (current === total) {
        setTimeout(() => {
            progressBar.style.width = "0%";
            progressBar.textContent = "";
        }, 1000);
    }
}

// Valider un fichier avant upload
function validateFile(file) {
    const errors = [];

    // Vérifier le type
    const isImage = isAllowedImageFile(file);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
        errors.push("Type de fichier non supporté");
    }

    // Vérifier la taille
    if (file.size > MAX_FILE_SIZE) {
        errors.push("Fichier trop volumineux");
    }

    return {
        valid: errors.length === 0,
        errors: errors,
    };
}

// Formater la taille d'un fichier
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
