import React, { useState, useRef } from 'react';
import { Upload, File, X } from 'lucide-react';

const SimpleAudioUpload = ({ onUploadSuccess, API_BASE = import.meta.env.VITE_API_BASE_URL }) => {
    const [file, setFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const fileInputRef = useRef(null);

    function handleFileProcess(file) {
        if (file && file.type.startsWith('audio/')) {
            setFile(file);
            setUploadStatus(`Selected: ${file.name}`);
        } else {
            setUploadStatus('Please select a valid audio file');
        }
    }

    const handleFileSelect = (event) => {
        const selectedFile = event.target.files[0];
        handleFileProcess(selectedFile);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        handleFileProcess(droppedFile);
    };

    const uploadFile = async () => {
        if (!file) return;

        try {
            setIsLoading(true);
            setUploadStatus('Processing...');

            const meetingId = `meeting-${Math.floor(Date.now() / 1000)}`;
            const presignedResponse = await fetch(`${API_BASE}/presigned-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId: meetingId,
                    fileName: file.name,
                    contentType: file.type
                })
            });

            if (!presignedResponse.ok) throw new Error('Failed to get upload URL');
            const { uploadUrl, key } = await presignedResponse.json();

            setUploadStatus('Uploading...');
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type || 'audio/mp3' }
            });

            if (!uploadResponse.ok) throw new Error('Failed to upload file');

            setUploadStatus('✅ Upload successful!');
            if (onUploadSuccess) onUploadSuccess(meetingId, key);
            setTimeout(() => resetForm(), 3000);

        } catch (error) {
            setUploadStatus(`❌ Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFile(null);
        setUploadStatus('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getToastClass = () => {
        if (uploadStatus.includes('✅')) return 'audio-upload-toast success';
        if (uploadStatus.includes('❌')) return 'audio-upload-toast error';
        return 'audio-upload-toast info';
    };

    return (
        <div className="audio-upload-container">
            <div className="audio-upload-content single-column">
                <div className="audio-upload-panel">
                    {!file ? (
                        <>
                            <div className="audio-upload-panel-header">
                                <h2>Upload Audio Files</h2>
                                <p>Drag & drop or click to browse</p>
                            </div>

                            <div
                                className={`audio-upload-dropzone ${isDragOver ? 'drag-over' : ''}`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="audio-upload-dropzone-icon">
                                    <Upload size={24} color="white" />
                                </div>
                                <div>
                                    <h3>{isDragOver ? 'Drop here' : 'Select Audio Files'}</h3>
                                    <p>MP3, WAV, M4A, OGG</p>
                                    <div className="audio-upload-browse-btn">
                                        <File size={14} />
                                        Browse
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="audio-upload-file-info">
                                <div className="audio-upload-file-info-left">
                                    <div className="audio-upload-file-icon">
                                        <File size={18} color="white" />
                                    </div>
                                    <div className="audio-upload-file-details">
                                        <h4>{file.name}</h4>
                                        <div className="audio-upload-file-meta">
                                            <span className="audio-upload-file-size">
                                                {formatFileSize(file.size)}
                                            </span>
                                            <span className="audio-upload-file-type audio">
                                                Audio
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button onClick={resetForm} className="audio-upload-remove-btn">
                                    <X size={14} />
                                </button>
                            </div>

                            <button
                                onClick={uploadFile}
                                disabled={isLoading}
                                className="audio-upload-btn"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="audio-upload-spinner"></div>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={16} />
                                        Upload & Process
                                    </>
                                )}
                            </button>
                        </>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleFileSelect}
                        className="audio-upload-input"
                    />
                </div>
            </div>

            {uploadStatus && (
                <div className={getToastClass()}>
                    {uploadStatus}
                </div>
            )}
        </div>
    );
};

export default SimpleAudioUpload;