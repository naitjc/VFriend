<script setup>
import { ref } from 'vue'

const emit = defineEmits(['select'])

const categories = [
  {
    key: 'smileys',
    icon: '😀',
    label: '笑脸',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
      '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
      '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
      '😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪',
      '😴','😷','🤒','🤕','🥴','😵','🤯','🥳','😎','🤓',
      '😕','😟','🙁','😮','😲','😳','🥺','😦','😧','😨',
      '😰','😢','😭','😱','😖','😣','😞','😓','😩','😫',
      '😤','😡','😠','🤬','😈','💀','💩','🤡','👻','👾',
    ],
  },
  {
    key: 'gestures',
    icon: '👋',
    label: '手势',
    emojis: [
      '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞',
      '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
      '👎','✊','👊','🤛','🤜','🤝','👏','🙌','👐','🤲',
      '🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂',
    ],
  },
  {
    key: 'hearts',
    icon: '❤️',
    label: '心心',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔',
      '❣️','💕','💞','💓','💗','💖','💘','💝','💟','❤️‍🔥',
      '❤️‍🩹','💌','💋','👄','🫦','🫀','💏','💑','🥂','💒',
    ],
  },
  {
    key: 'celebrate',
    icon: '🎉',
    label: '庆祝',
    emojis: [
      '🎉','🎊','🎈','🎁','🎀','🎗️','🏆','🥇','🥈','🥉',
      '🌟','⭐','💫','✨','🌠','🎆','🎇','🧨','🎯','🎮',
      '🎲','🃏','🎴','🀄','🎭','🎨','🎬','🎤','🎧','🎼',
      '🎵','🎶','🎸','🥁','🎹','🎺','🎻','🪗','🎷','🪘',
    ],
  },
  {
    key: 'nature',
    icon: '🌸',
    label: '自然',
    emojis: [
      '🌸','🌺','🌻','🌹','🌷','💐','🌿','🍀','🌱','🌲',
      '🌳','🌴','🌵','🍄','🌾','🍃','🍂','🍁','🌊','🌈',
      '🌙','⭐','☀️','⛅','🌤','🌥','🌦','🌧','⛈','🌩',
      '🌨','❄️','🌬','🌪','🔥','💧','🌍','🌏','🌐','🪐',
    ],
  },
  {
    key: 'food',
    icon: '🍕',
    label: '美食',
    emojis: [
      '🍕','🍔','🌮','🌯','🍜','🍣','🍱','🍛','🍝','🍲',
      '🥗','🥘','🫕','🥫','🍿','🧁','🍰','🎂','🍮','🍭',
      '🍬','🍫','🍩','🍪','🍦','🍧','🍨','🍡','🥧','🍯',
      '☕','🍵','🧃','🥤','🧋','🍺','🥂','🍷','🍸','🧉',
    ],
  },
  {
    key: 'animals',
    icon: '🐶',
    label: '动物',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
      '🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅',
      '🦉','🦇','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🦕',
      '🐙','🦑','🦈','🐬','🐳','🦓','🦒','🐘','🦏','🐆',
    ],
  },
  {
    key: 'symbols',
    icon: '✨',
    label: '符号',
    emojis: [
      '✨','💥','💢','💬','💭','💤','🔥','⚡','🌀','🌈',
      '🔔','🔕','🎵','🎶','💯','❗','❓','‼️','⁉️','🔅',
      '🔆','🔱','⚜️','♻️','✅','❎','🔴','🟠','🟡','🟢',
      '🔵','🟣','⚫','⚪','🟤','🔺','🔻','💠','🔷','🔶',
    ],
  },
]

const activeCategory = ref(categories[0].key)

const currentEmojis = () =>
  categories.find(c => c.key === activeCategory.value)?.emojis ?? []

const onSelect = (emoji) => emit('select', emoji)
</script>

<template>
  <div class="emoji-picker">
    <!-- 分类 tab -->
    <div class="category-bar">
      <button
        v-for="cat in categories"
        :key="cat.key"
        class="cat-btn"
        :class="{ active: activeCategory === cat.key }"
        :title="cat.label"
        @click="activeCategory = cat.key"
      >
        {{ cat.icon }}
      </button>
    </div>

    <!-- 表情网格 -->
    <div class="emoji-grid">
      <button
        v-for="emoji in currentEmojis()"
        :key="emoji"
        class="emoji-btn"
        @click="onSelect(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker {
  width: 300px;
  background: var(--bg-glass-card, rgba(255,255,255,0.3));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  border: 1px solid var(--border-glass-strong, rgba(255,255,255,0.45));
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0,0,0,0.12));
  overflow: hidden;
  user-select: none;
}

/* 分类栏 */
.category-bar {
  display: flex;
  gap: 2px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--border-glass, rgba(255,255,255,0.3));
  background: var(--bg-glass, rgba(255,255,255,0.18));
}

.cat-btn {
  flex: 1;
  background: none;
  border: none;
  border-radius: 8px;
  padding: 5px 2px;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.18s, transform 0.15s;
  opacity: 0.55;
}

.cat-btn:hover {
  background: var(--bg-glass-hover, rgba(255,255,255,0.35));
  opacity: 0.9;
  transform: scale(1.12);
}

.cat-btn.active {
  background: var(--bg-glass-hover, rgba(255,255,255,0.38));
  opacity: 1;
  transform: scale(1.15);
}

/* 表情网格 */
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 1px;
  padding: 8px;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb, rgba(124,131,253,0.3)) transparent;
}

.emoji-btn {
  background: none;
  border: none;
  border-radius: 8px;
  padding: 4px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, transform 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
}

.emoji-btn:hover {
  background: var(--bg-glass-hover, rgba(255,255,255,0.4));
  transform: scale(1.22);
}

.emoji-btn:active {
  transform: scale(0.95);
}
</style>
