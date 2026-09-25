import countriesData from '../data/countries.js'
import { Events } from './Events.js'

export class InputFlag
{
    constructor(element)
    {
        // Setup
        this.element = element
        this.buttonElement = this.element.querySelector('.js-flag-button')
        this.currentElement = this.buttonElement.querySelector('.js-flag')
        this.selectElement = this.element.querySelector('.js-flag-select')
        this.closeElement = this.element.querySelector('.js-flag-close')
        this.searchElement = this.element.querySelector('.js-flag-search')
        this.removeElement = this.element.querySelector('.js-flag-remove')
        this.noResultElement = this.element.querySelector('.js-no-result')
        this.scrollerElement = this.element.querySelector('.js-scroller')
        this.selectOriginalParent = this.selectElement.parentElement
        this.selectOriginalNextSibling = this.selectElement.nextSibling

        this.events = new Events()
        this.inDOM = false
        this.isOpen = false
        this.countries = new Map()
        this.country = null

        this.setCountries()
        this.setSearch()

        // DOM events
        this.removeElement.addEventListener('click', (event) =>
        {
            event.preventDefault()
            this.select(null)
        })

        this.buttonElement.addEventListener('click', (event) =>
        {
            event.preventDefault()
            this.open()
        })

        this.closeElement.addEventListener('click', (event) =>
        {
            event.preventDefault()
            this.close()
        })

        // Country code
        let countryCode = ''

        const localCountryCode = localStorage.getItem('countryCode')
        if(localCountryCode)
            countryCode = localCountryCode

        if(countryCode === '')
        {
            const locale = Intl.DateTimeFormat().resolvedOptions().locale
            
            if(locale)
            {
                const localeSplit = locale.split('-')

                if(localeSplit.length)
                {
                    countryCode = localeSplit[localeSplit.length - 1].toLowerCase()
                }
            }
        }

        if(countryCode !== '')
        {
            this.country = this.countries.get(countryCode) ?? null

            if(this.country)
            {
                this.currentElement.src = this.country.imageUrl
                this.buttonElement.classList.add('has-flag')
            }
        }

        this.reposition = () => this.positionSelect()
        window.addEventListener('resize', this.reposition)
        window.addEventListener('orientationchange', this.reposition)
        window.visualViewport?.addEventListener('resize', this.reposition)
        window.visualViewport?.addEventListener('scroll', this.reposition)
    }

    setCountries()
    {
        // Arabic labels and search terms; ISO codes and stored selections stay unchanged.
        const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['ar'], {type:'region'}) : null
        for(const _country of countriesData)
        {
            let arabicName = _country[0]
            try { arabicName = regions?.of(_country[2].toUpperCase()) || arabicName } catch {}
            const imageUrl = `ui/flags/${_country[2]}.webp`
            const element = document.createElement('div')
            element.classList.add('choice')
            element.innerHTML = /* html */`
                <img class="js-flag flag" src="${imageUrl}" loading="lazy">
                <span class="label">${arabicName} (${_country[2]})</span>
            `

            const country = {}
            country.element = element
            country.terms = `${arabicName} ${_country[0]} ${_country[1]} ${_country[2]}`
            country.imageUrl = imageUrl
            country.code = _country[2]

            country.element.addEventListener('click', () =>
            {
                this.select(country)
            })

            this.countries.set(country.code, country)
        }
    }

    setSearch()
    {
        const searchFlag = (value) =>
        {
            const sanatizedValue = value.trim()
            let found = false

            // Empty search => All countries
            if(sanatizedValue === '')
            {
                found = true
                this.countries.forEach((country) =>
                {
                    country.element.style.display = ''
                })
            }

            // Non-empty search => Search each terms
            else
            {
                this.countries.forEach((country) =>
                {
                    if(country.terms.toLocaleLowerCase().includes(sanatizedValue.toLocaleLowerCase()))
                    {
                        found = true
                        country.element.style.display = ''
                    }
                    else
                    {
                        country.element.style.display = 'none'
                    }
                })
            }

            // No result
            if(!found)
                this.noResultElement.classList.add('is-visible')
            else
                this.noResultElement.classList.remove('is-visible')
        }

        this.searchElement.addEventListener('input', () =>
        {
            searchFlag(this.searchElement.value)
        })
    }

    addToDOM()
    {
        this.countries.forEach(_country =>
        {
            this.scrollerElement.appendChild(_country.element)
        })
        
        this.inDOM = true
    }

    positionSelect()
    {
        if(!this.isOpen)
            return

        const viewportWidth = window.visualViewport?.width ?? window.innerWidth
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight
        const viewportOffsetLeft = window.visualViewport?.offsetLeft ?? 0
        const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0
        const margin = 8
        const gap = 8
        const width = Math.min(350, Math.max(220, viewportWidth - margin * 2))
        const height = Math.min(300, Math.max(220, viewportHeight - margin * 2))
        const rect = this.buttonElement.getBoundingClientRect()

        let left = rect.left
        left = Math.max(
            viewportOffsetLeft + margin,
            Math.min(left, viewportOffsetLeft + viewportWidth - width - margin)
        )

        let top = rect.top - height - gap
        if(top < viewportOffsetTop + margin)
            top = rect.bottom + gap

        top = Math.max(
            viewportOffsetTop + margin,
            Math.min(top, viewportOffsetTop + viewportHeight - height - margin)
        )

        this.selectElement.style.left = `${Math.round(left)}px`
        this.selectElement.style.top = `${Math.round(top)}px`
        this.selectElement.style.width = `${Math.round(width)}px`
        this.selectElement.style.height = `${Math.round(height)}px`
    }

    open()
    {
        // Already
        if(this.isOpen)
            return

        // Not yet in DOM > Add
        if(!this.inDOM)
            this.addToDOM()

        this.isOpen = true

        // Move the picker to the document root while open so parent overflow
        // in menus/modals cannot clip it on mobile Safari.
        document.body.appendChild(this.selectElement)
        this.selectElement.classList.add('is-floating', 'is-visible')
        this.buttonElement.setAttribute('aria-expanded', 'true')
        this.positionSelect()

        // Opening the iOS keyboard immediately can hide the picker.
        if(!window.matchMedia('(pointer: coarse)').matches)
            this.searchElement.focus()

        if(this.country)
            this.scrollerElement.scrollTop = this.country.element.offsetTop - 15
    }

    close()
    {
        // Already
        if(!this.isOpen)
            return

        this.isOpen = false
        this.selectElement.classList.remove('is-visible', 'is-floating')
        this.buttonElement.setAttribute('aria-expanded', 'false')

        this.selectElement.style.removeProperty('left')
        this.selectElement.style.removeProperty('top')
        this.selectElement.style.removeProperty('width')
        this.selectElement.style.removeProperty('height')

        if(this.selectOriginalNextSibling && this.selectOriginalNextSibling.parentNode === this.selectOriginalParent)
            this.selectOriginalParent.insertBefore(this.selectElement, this.selectOriginalNextSibling)
        else
            this.selectOriginalParent.appendChild(this.selectElement)
    }

    select(country = null)
    {
        // Selected a flag
        if(country)
        {
            this.country = country
            this.currentElement.src = country.imageUrl
            this.buttonElement.classList.add('has-flag')
            localStorage.setItem('countryCode', country.code)
        }

        // Selected no flag
        else
        {
            this.country = null
            this.buttonElement.classList.remove('has-flag')
            localStorage.removeItem('countryCode')
        }

        // Trigger event
        this.events.trigger('change', [ country ])

        this.close()
    }
}