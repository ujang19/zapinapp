import React, { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'

interface LogoProps {
  className?: string
  width?: number
  height?: number
  onClick?: () => void
  isCollapsed?: boolean
}

export function Logo({ className = '', width = 40, height = 40, onClick, isCollapsed = true }: LogoProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Reset hover state when isCollapsed changes
  useEffect(() => {
    setIsHovered(false)
  }, [isCollapsed])

  // Only show hover effect when sidebar is collapsed
  if (isHovered && isCollapsed) {
    return (
      <div
        className={`flex items-center justify-center cursor-pointer ${className}`}
        style={{ width, height }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
      >
        <ChevronRight className="w-5 h-5 text-gray-600" />
      </div>
    )
  }



  return (
    <svg
      id="Layer_2"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 89.25 89.25"
      width={width}
      height={height}
      className={`cursor-pointer ${className}`}
      onMouseEnter={() => isCollapsed && setIsHovered(true)}
      onMouseLeave={() => isCollapsed && setIsHovered(false)}
      onClick={onClick}
    >
      <defs>
        <clipPath id="clippath">
          <path
            d="m25.22,0h38.81c13.87,0,25.22,11.35,25.22,25.22v38.81c0,13.87-11.35,25.22-25.22,25.22H25.22c-13.87,0-25.22-11.35-25.22-25.22V25.22C0,11.35,11.35,0,25.22,0"
            style={{
              clipRule: 'evenodd',
              fill: 'none',
              strokeWidth: '0px'
            }}
          />
        </clipPath>
        <linearGradient
          id="linear-gradient"
          x1="-3.04"
          y1="130.13"
          x2="75.88"
          y2="-11.44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7cd16f" />
          <stop offset="1" stopColor="#25d366" />
        </linearGradient>
      </defs>
      <g id="Layer_1-2">
        <g style={{ clipPath: 'url(#clippath)' }}>
          <rect
            width="89.25"
            height="89.25"
            style={{
              fill: 'url(#linear-gradient)',
              strokeWidth: '0px'
            }}
          />
        </g>
        <path
          d="m25.89,15.34h12.49c8.07,5.97-2.24,17.24-9.94,23.26h-2.56c-6.42,0-11.63-5.21-11.63-11.63s5.21-11.63,11.63-11.63"
          style={{
            fill: '#fff',
            fillRule: 'evenodd',
            strokeWidth: '0px'
          }}
        />
        <path
          d="m34.39,70.23c-2.12,2.27-5.14,3.69-8.5,3.69-6.42,0-11.63-5.21-11.63-11.63,0-3.35,1.42-6.37,3.69-8.5h0s14.1-14.11,14.1-14.11c5.14-5.14,19.13-16.39,10.45-24.34h16.6c5.13,0,9.52,3.37,11.05,8.01,2.31,6.99-1.54,12.39-5.94,17.04l-.05.06-.05.06-.04.05h-.01s0,.02,0,.02l-.1.1-.05.06-.05.06h-.01s-.04.06-.04.06l-.05.06-.11.11-.03.03-.02.02-.05.06-.05.05-.05.06-.05.05h0s-.11.11-.11.11l-.05.05-.05.05-.02.02-.03.03-.05.05-.05.05-.05.05-.04.04h0s-.05.06-.05.06l-.05.05-.05.05-.05.05h-.01s-.04.05-.04.05l-.05.05-.05.05-.05.05-.03.03c-.54.54-1.08,1.08-1.61,1.6l-26.4,26.4h0Z"
          style={{
            fill: '#fff',
            fillRule: 'evenodd',
            strokeWidth: '0px'
          }}
        />
        <path
          d="m63.36,50.64c6.42,0,11.63,5.21,11.63,11.63s-5.21,11.63-11.63,11.63-11.63-5.21-11.63-11.63,5.21-11.63,11.63-11.63"
          style={{
            fill: '#fff',
            fillRule: 'evenodd',
            strokeWidth: '0px'
          }}
        />
      </g>
    </svg>
  )
}