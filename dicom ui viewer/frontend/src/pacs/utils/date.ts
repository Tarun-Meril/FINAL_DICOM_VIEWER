export const formatDate = (dicomDate?: string): string => {
  if (!dicomDate || dicomDate.length !== 8) return dicomDate || 'N/A';
  
  const year = dicomDate.substring(0, 4);
  const month = dicomDate.substring(4, 6);
  const day = dicomDate.substring(6, 8);
  
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = months[monthIndex] || month;
  
  return `${monthName} ${parseInt(day, 10)}, ${year}`;
};

export const formatTime = (dicomTime?: string): string => {
  if (!dicomTime || dicomTime.length < 4) return dicomTime || 'N/A';
  
  const hours = parseInt(dicomTime.substring(0, 2), 10);
  const minutes = dicomTime.substring(2, 4);
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${displayHours}:${minutes} ${ampm}`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
