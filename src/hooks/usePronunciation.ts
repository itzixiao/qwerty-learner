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
function useYoudaoSound(word: string, pronunciation: Exclude<PronunciationType, false>, isLoop: boolean, volume: number, rate: number) {
  const [isPlaying, setIsPlaying] = useState(false)

  const [play, { stop, sound }] = useSound(generateWordSoundSrc(word, pronunciation), {
    html5: true,
    format: ['mp3'],
    loop: isLoop,
    volume,
    rate,
  } as HookOptions)

  useEffect(() => {
    if (!sound) return
    sound.loop(isLoop)
    return noop
  }, [isLoop, sound])

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

  // 单词使用有道 API
  const youdaoSound = useYoudaoSound(
    word,
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

      // gpt 说这这两行能尽可能规避下载插件被触发问题。 本地测试不加也可以，考虑到别的插件可能有问题，所以加上保险
      audio.crossOrigin = 'anonymous'
      audio.style.display = 'none'

      head.appendChild(audio)

      return () => {
        head.removeChild(audio)
      }
    }
  }, [pronunciationConfig.type, word])
}
