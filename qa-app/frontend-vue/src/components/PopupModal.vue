<script setup>
import { ref } from 'vue'

const dialogVisible = ref(true)

const handleClose = () => {
  dialogVisible.value = false
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :show-close="true"
    align-center
    width="420px"
    class="welcome-dialog"
    @close="handleClose"
  >
    <div class="dialog-content">
      <el-image
        src="/启动页.webp"
        style="width: 260px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(124,131,253,0.2);"
        fit="contain"
      />
      <h2 class="dialog-title">欢迎来到 VFriend</h2>
      <p class="dialog-text">
        陪你聊天、一起经历故事的虚拟伙伴。
      </p>
      <el-button type="primary" class="dialog-btn" @click="handleClose">
        开始聊天
      </el-button>
    </div>
  </el-dialog>
</template>

<style>
.welcome-dialog .el-dialog {
  border-radius: 24px !important;
  background: rgba(255, 255, 255, 0.85) !important;
  backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  box-shadow: 0 24px 64px rgba(124, 131, 253, 0.15) !important;
  padding: 0 !important;
}

.welcome-dialog .el-dialog__header {
  display: none;
}

.welcome-dialog .el-dialog__body {
  padding: 0 !important;
}
</style>

<style scoped>
.dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 32px;
  text-align: center;
}

.dialog-title {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 12px;
}

.dialog-text {
  font-size: 15px;
  color: #64748b;
  line-height: 1.6;
  margin: 0 0 24px;
}

.dialog-btn {
  border-radius: 14px;
  padding: 10px 32px;
  font-size: 15px;
  font-weight: 500;
  background: linear-gradient(135deg, #7c83fd, #a78bfa);
  border: none;
  box-shadow: 0 4px 16px rgba(124, 131, 253, 0.3);
  transition: var(--transition);
}

.dialog-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(124, 131, 253, 0.4);
}
</style>
