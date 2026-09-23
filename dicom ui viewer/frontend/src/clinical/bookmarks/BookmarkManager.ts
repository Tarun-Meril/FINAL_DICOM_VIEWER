export interface NamedBookmark {
  id: string;
  name: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  cameraState: { position: [number, number, number]; target: [number, number, number]; fov: number };
  sliceIndex: number;
  thumbnailUrl?: string;
  createdAt: string;
}

export class CameraBookmarks {
  private bookmarks = new Map<string, NamedBookmark>();

  public saveBookmark(bookmark: NamedBookmark): void {
    this.bookmarks.set(bookmark.id, bookmark);
  }

  public getBookmark(id: string): NamedBookmark | undefined {
    return this.bookmarks.get(id);
  }

  public getBookmarksByStudy(studyUid: string): NamedBookmark[] {
    return Array.from(this.bookmarks.values()).filter(b => b.studyInstanceUid === studyUid);
  }
}

export class BookmarkManager {
  public cameraBookmarks = new CameraBookmarks();

  public createBookmark(name: string, studyUid: string, seriesUid: string, cameraPos: [number, number, number], targetPos: [number, number, number], sliceIdx: number): NamedBookmark {
    const bookmark: NamedBookmark = {
      id: `bm-${Date.now()}`,
      name,
      studyInstanceUid: studyUid,
      seriesInstanceUid: seriesUid,
      cameraState: { position: cameraPos, target: targetPos, fov: 45 },
      sliceIndex: sliceIdx,
      createdAt: new Date().toISOString()
    };
    this.cameraBookmarks.saveBookmark(bookmark);
    return bookmark;
  }
}
