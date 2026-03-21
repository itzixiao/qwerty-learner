import { pronunciationConfigAtom } from '@/store'
import type { PronunciationType } from '@/typings'
import { addHowlListener } from '@/utils'
import { romajiToHiragana } from '@/utils/kana'
import noop from '@/utils/noop'
import type { Howl } from 'howler'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSound from 'use-sound'
import type { HookOptions } from 'use-sound/dist/types'

const pronunciationApi = 'https://dict.youdao.com/dictvoice?audio='

/**
 * 判断是否为多词短语（包含空格）
 * 有道词典 dictvoice API 不支持多词短语，需要使用 Web Speech API
 */
function isMultiWordPhrase(word: string): boolean {
  return word.includes(' ')
}

/**
 * 对单词/短语进行URL编码，处理多词短语中的空格问题
 * 有道词典API要求空格编码为+号（或%20）
 */
function encodeWord(word: string): string {
  return encodeURIComponent(word).replace(/%20/g, '+')
}

/**
 * 获取 Web Speech API 的语言代码
 */
function getSpeechLang(pronunciation: Exclude<PronunciationType, false>): string {
  switch (pronunciation) {
    case 'uk':
      return 'en-GB'
    case 'us':
      return 'en-US'
    case 'romaji':
    case 'ja':
      return 'ja-JP'
    case 'zh':
      return 'zh-CN'
    case 'de':
      return 'de-DE'
    case 'hapin':
    case 'kk':
      return 'ru-RU' // 有道不支持哈萨克语, 暂时用俄语发音兜底
    case 'id':
      return 'id-ID'
    default:
      return 'en-US'
  }
}

export function generateWordSoundSrc(word: string, pronunciation: Exclude<PronunciationType, false>): string {
  const encodedWord = encodeWord(word)
  switch (pronunciation) {
    case 'uk':
      return `${pronunciationApi}${encodedWord}&type=1`
    case 'us':
      return `${pronunciationApi}${encodedWord}&type=2`
    case 'romaji':
      return `${pronunciationApi}${encodeWord(romajiToHiragana(word))}&le=jap`
    case 'zh':
      return `${pronunciationApi}${encodedWord}&le=zh`
    case 'ja':
      return `${pronunciationApi}${encodedWord}&le=jap`
    case 'de':
      return `${pronunciationApi}${encodedWord}&le=de`
    case 'hapin':
    case 'kk':
      return `${pronunciationApi}${encodedWord}&le=ru` // 有道不支持哈萨克语, 暂时用俄语发音兜底
    case 'id':
      return `${pronunciationApi}${encodedWord}&le=id`
    default:
      return ''
  }
}

/**
 * 使用 Web Speech API 的发音 Hook（用于多词短语）
 */
function useSpeechSynthesisSound(word: string, pronunciation: Exclude<PronunciationType, false>, volume: number, rate: number) {
  const [isPlaying, setIsPlaying] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const play = useCallback(() => {
    if (!('speechSynthesis' in window)) {
      console.warn('Web Speech API not supported')
      return
    }

    // 停止之前的播放
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(word)
    utterance.lang = getSpeechLang(pronunciation)
    utterance.volume = volume
    utterance.rate = rate

    utterance.onstart = () => setIsPlaying(true)
    utterance.onend = () => setIsPlaying(false)
    utterance.onerror = () => setIsPlaying(false)

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [word, pronunciation, volume, rate])

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }, [])

  // 组件卸载时停止播放
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return { play, stop, isPlaying }
}

/**
 * 使用有道 API 的发音 Hook（用于单词）
 */
function useYoudaoSound(word: string, pronunciation: Exclude<PronunciationType, false>, loop: boolean, volume: number, rate: number) {
  const [isPlaying, setIsPlaying] = useState(false)

  const soundUrl = generateWordSoundSrc(word, pronunciation)
  const [play, { stop, sound }] = useSound(soundUrl, {
    html5: true,
    format: ['mp3'],
    loop,
    volume,
    rate,
  } as HookOptions)

  useEffect(() => {
    if (!sound) return
    sound.loop(loop)
    return noop
  }, [loop, sound])

  useEffect(() => {
    if (!sound) return
    const unListens: Array<() => void> = []

    unListens.push(addHowlListener(sound, 'play', () => setIsPlaying(true)))
    unListens.push(addHowlListener(sound, 'end', () => setIsPlaying(false)))
    unListens.push(addHowlListener(sound, 'pause', () => setIsPlaying(false)))
    unListens.push(addHowlListener(sound, 'playerror', () => setIsPlaying(false)))

    return () => {
      setIsPlaying(false)
      unListens.forEach((unListen) => unListen())
      ;(sound as Howl).unload()
    }
  }, [sound])

  return { play, stop, isPlaying }
}

/**
 * 多词短语的发音 Hook（使用 Web Speech API）
 * 单独导出，避免违反 React Hooks 规则
 */
export function useMultiWordPhraseSound(word: string, isLoop?: boolean) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  return useSpeechSynthesisSound(
    word,
    pronunciationConfig.type as Exclude<PronunciationType, false>,
    pronunciationConfig.volume,
    pronunciationConfig.rate,
  )
}

export default function usePronunciationSound(word: string, isLoop?: boolean) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)
  const loop = useMemo(() => (typeof isLoop === 'boolean' ? isLoop : pronunciationConfig.isLoop), [isLoop, pronunciationConfig.isLoop])
  const pronunciation = pronunciationConfig.type

  // 判断是否为多词短语
  const isPhrase = useMemo(() => isMultiWordPhrase(word), [word])

  // 多词短语使用 Web Speech API
  const speechSound = useSpeechSynthesisSound(
    word,
    pronunciation as Exclude<PronunciationType, false>,
    pronunciationConfig.volume,
    pronunciationConfig.rate,
  )

  // 单词使用有道 API - 传入空字符串避免实际加载
  // 注意：这里仍然需要调用 useYoudaoSound 以遵守 React Hooks 规则
  // 但对于多词短语，我们会使用 speechSound 的返回值
  const youdaoSound = useYoudaoSound(
    isPhrase ? '' : word, // 多词短语时传入空字符串，避免加载音频
    pronunciation as Exclude<PronunciationType, false>,
    loop,
    pronunciationConfig.volume,
    pronunciationConfig.rate,
  )

  // 根据是否为多词短语选择不同的实现
  if (isPhrase) {
    return speechSound
  }
  return youdaoSound
}

export function usePrefetchPronunciationSound(word: string | undefined) {
  const pronunciationConfig = useAtomValue(pronunciationConfigAtom)

  useEffect(() => {
    if (!word) return

    // 多词短语使用 Web Speech API，不需要预加载音频
    if (isMultiWordPhrase(word)) return

    const soundUrl = generateWordSoundSrc(word, pronunciationConfig.type)
    if (soundUrl === '') return

    const head = document.head
    const isPrefetch = (Array.from(head.querySelectorAll('link[href]')) as HTMLLinkElement[]).some((el) => el.href === soundUrl)

    if (!isPrefetch) {
      const audio = new Audio()
      audio.src = soundUrl
      audio.preload = 'auto'
      // 注意：不设置 crossOrigin，避免 CORS 问题
      audio.style.display = 'none'

      head.appendChild(audio)

      return () => {
        head.removeChild(audio)
      }
    }
  }, [pronunciationConfig.type, word])
}
