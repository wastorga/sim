'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { getFormattedGitHubStars } from '@/app/(landing-2)/actions/github'
import GitHubStarsClient from '@/app/(landing-2)/components/github-stars-client'
import NavClient from '@/app/(landing-2)/components/nav-client'

interface NavWrapperProps {
  onOpenTypeformLink: () => void
}

export default function NavWrapper({ onOpenTypeformLink }: NavWrapperProps) {
  // Use a client-side component to wrap the navigation
  // This avoids trying to use server-side UA detection
  // which has compatibility challenges

  const pathname = usePathname()
  const [initialIsMobile, setInitialIsMobile] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  // Default to a reasonable number and update it later
  const [starCount, setStarCount] = useState('1.2k')

  useEffect(() => {
    // Set initial mobile state based on window width
    setInitialIsMobile(window.innerWidth < 768)

    // Slight delay to ensure smooth animations with other elements
    setTimeout(() => {
      setIsLoaded(true)
    }, 100)

    // Use server action to fetch stars
    getFormattedGitHubStars()
      .then((formattedStars) => {
        setStarCount(formattedStars)
      })
      .catch((err) => {
        console.error('Failed to fetch GitHub stars:', err)
      })
  }, [])

  return (
    <>
      <AnimatePresence mode='wait'>
        {!isLoaded ? (
          <motion.div
            key='loading'
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className='absolute top-1 right-0 left-0 z-30 px-4 py-8'
          >
            <div className='relative mx-auto flex max-w-7xl items-center justify-between'>
              <div className='flex-1' />
              <div className='flex flex-1 justify-end'>
                <div className='h-[43px] w-[43px]' />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key='loaded'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <NavClient
              initialIsMobile={initialIsMobile}
              currentPath={pathname}
              onContactClick={onOpenTypeformLink}
            >
              <GitHubStarsClient stars={starCount} />
            </NavClient>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
