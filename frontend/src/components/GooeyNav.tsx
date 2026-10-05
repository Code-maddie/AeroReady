// Adapted from React Bits <GooeyNav /> (JavaScript + CSS variant).
// Changes: TypeScript; items can be router links (`to`) or plain anchors (`href`);
// the active item can be controlled by the caller (the current route) and the
// bubble effect plays whenever it changes; particles are skipped when the user
// prefers reduced motion.
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import './GooeyNav.css'

export interface GooeyNavItem { label: string; to?: string; href?: string }

interface Props {
  items: GooeyNavItem[]
  animationTime?: number
  particleCount?: number
  particleDistances?: [number, number]
  particleR?: number
  timeVariance?: number
  colors?: number[]
  initialActiveIndex?: number
  /** Controlled active item (for example the current route); -1 for none. */
  activeIndex?: number
  /** Larger touch targets (technician pages). */
  large?: boolean
  label?: string
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function GooeyNav({
  items, animationTime = 600, particleCount = 15, particleDistances = [90, 10], particleR = 100,
  timeVariance = 300, colors = [1, 2, 3, 1, 2, 3, 1, 4], initialActiveIndex = 0, activeIndex: controlled, large = false, label = 'Pages',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLUListElement>(null)
  const filterRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [internal, setInternal] = useState(initialActiveIndex)
  const activeIndex = controlled ?? internal
  const shown = useRef<number | null>(null)

  const noise = (n = 1) => n / 2 - Math.random() * n
  const getXY = (distance: number, pointIndex: number, totalPoints: number) => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180)
    return [distance * Math.cos(angle), distance * Math.sin(angle)]
  }
  const createParticle = (i: number, t: number, d: [number, number], r: number) => {
    const rotate = noise(r / 10)
    return {
      start: getXY(d[0], particleCount - i, particleCount),
      end: getXY(d[1] + noise(7), particleCount - i, particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: colors[Math.floor(Math.random() * colors.length)],
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
    }
  }

  const makeParticles = (element: HTMLElement) => {
    const bubbleTime = animationTime * 2 + timeVariance
    element.style.setProperty('--time', `${bubbleTime}ms`)
    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 2 + noise(timeVariance * 2)
      const p = createParticle(i, t, particleDistances, particleR)
      element.classList.remove('active')
      setTimeout(() => {
        const particle = document.createElement('span')
        const point = document.createElement('span')
        particle.classList.add('particle')
        particle.style.setProperty('--start-x', `${p.start[0]}px`)
        particle.style.setProperty('--start-y', `${p.start[1]}px`)
        particle.style.setProperty('--end-x', `${p.end[0]}px`)
        particle.style.setProperty('--end-y', `${p.end[1]}px`)
        particle.style.setProperty('--time', `${p.time}ms`)
        particle.style.setProperty('--scale', `${p.scale}`)
        particle.style.setProperty('--color', `var(--gooey-${p.color}, white)`)
        particle.style.setProperty('--rotate', `${p.rotate}deg`)
        point.classList.add('point')
        particle.appendChild(point)
        element.appendChild(particle)
        requestAnimationFrame(() => element.classList.add('active'))
        setTimeout(() => { try { element.removeChild(particle) } catch { /* already removed */ } }, t)
      }, 30)
    }
  }

  const updateEffectPosition = (element: HTMLElement) => {
    if (!containerRef.current || !filterRef.current || !textRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const pos = element.getBoundingClientRect()
    const styles = {
      left: `${pos.x - containerRect.x}px`, top: `${pos.y - containerRect.y}px`,
      width: `${pos.width}px`, height: `${pos.height}px`,
    }
    Object.assign(filterRef.current.style, styles)
    Object.assign(textRef.current.style, styles)
    textRef.current.innerText = element.innerText
  }

  /** Move the pill to `index`; play the bubble effect unless this is the first paint. */
  const show = (index: number, animate: boolean) => {
    const li = navRef.current?.querySelectorAll('li')[index] as HTMLElement | undefined
    if (!li || !filterRef.current || !textRef.current) return
    updateEffectPosition(li)
    filterRef.current.style.visibility = 'visible'
    textRef.current.style.visibility = 'visible'
    filterRef.current.querySelectorAll('.particle').forEach((p) => p.remove())
    textRef.current.classList.remove('active')
    void textRef.current.offsetWidth
    textRef.current.classList.add('active')
    if (animate && !reducedMotion()) makeParticles(filterRef.current)
    else filterRef.current.classList.add('active')
  }

  useEffect(() => {
    if (activeIndex < 0) {
      if (filterRef.current) { filterRef.current.style.visibility = 'hidden'; filterRef.current.classList.remove('active') }
      if (textRef.current) { textRef.current.style.visibility = 'hidden'; textRef.current.classList.remove('active') }
      shown.current = -1
      return
    }
    show(activeIndex, shown.current !== null && shown.current !== activeIndex)
    shown.current = activeIndex
    const ro = new ResizeObserver(() => {
      const li = navRef.current?.querySelectorAll('li')[activeIndex] as HTMLElement | undefined
      if (li) updateEffectPosition(li)
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, items.length])

  const select = (index: number) => { if (controlled === undefined) setInternal(index) }
  const onKey = (e: KeyboardEvent, index: number) => { if (e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click(); select(index) } }

  return (
    <div className={`gooey-nav-container ${large ? 'gooey-large' : ''}`} ref={containerRef}>
      <nav aria-label={label}>
        <ul ref={navRef}>
          {items.map((item, index) => (
            <li key={item.to ?? item.href ?? index} className={activeIndex === index ? 'active' : ''}>
              {item.to
                ? <Link to={item.to} aria-current={activeIndex === index ? 'page' : undefined}
                    onClick={() => select(index)} onKeyDown={(e) => onKey(e, index)}>{item.label}</Link>
                : <a href={item.href} onClick={(_e: MouseEvent) => select(index)} onKeyDown={(e) => onKey(e, index)}>{item.label}</a>}
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} aria-hidden />
      <span className="effect text" ref={textRef} aria-hidden />
    </div>
  )
}
