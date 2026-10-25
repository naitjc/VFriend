
export function createArchivesActions({ exportArchivesApi, importArchivesApi, listTrashApi, restoreArchiveApi, listRelationshipsApi, cloneValue }) {
  return {
    async exportBackup() {
      if (this.isSending) throw new Error("请先停止或完成当前回复");
      if (this.activeConversationId && !this.isActiveChapterReadOnly && !await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError);
      return { ...await exportArchivesApi(), customCharacters: cloneValue(this.customCharacters) };
    },
    async importBackup(data) {
      if (this.isSending) throw new Error("请先停止或完成当前回复");
      if (this.activeConversationId && !this.isActiveChapterReadOnly && !await this.persistActiveConversation({ force: true })) throw new Error(this.persistenceError);
      const result = await importArchivesApi(data);
      if (Array.isArray(data.customCharacters)) {
        const known = new Set(this.customCharacters.map(character => character.id));
        for (const character of data.customCharacters) {
          if (typeof character?.id !== 'string' || !character.id.trim() || typeof character.basicInfo?.name !== 'string' || !character.basicInfo.name.trim() || known.has(character.id)) continue;
          known.add(character.id);
          this.customCharacters.push(cloneValue(character));
        }
        try { localStorage.setItem("customCharacters", JSON.stringify(this.customCharacters)); } catch { this.persistenceError = "存档已导入，浏览器角色库空间不足；角色快照仍保存在存档内。"; }
      }
      this._setRelationships(await listRelationshipsApi());
      if (result.relationshipId) await this.switchRelationship(result.relationshipId);
      return result;
    },
    async listDeletedArchives() { return listTrashApi(); },
    async restoreDeletedArchive(id) {
      if (this.isSending) throw new Error("请先停止或完成当前回复");
      const result = await restoreArchiveApi(id);
      this._setRelationships(await listRelationshipsApi());
      if (result?.relationshipId) {
        await this.switchRelationship(result.relationshipId);
        const recovered = this.characterSettings;
        if (recovered.id && !this.customCharacters.some(character => character.id === recovered.id)) {
          this.customCharacters.push(cloneValue(recovered));
          try { localStorage.setItem("customCharacters", JSON.stringify(this.customCharacters)); } catch { /* Snapshot is still persisted in SQLite. */ }
        }
      }
      return result;
    },

  }
}
