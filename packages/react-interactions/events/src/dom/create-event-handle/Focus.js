/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';
import useEvent from './useEvent';

const {useCallback, useEffect, useLayoutEffect, useRef} = React;

type FocusEvent = SyntheticEvent<EventTarget>;

type UseFocusOptions = {
  disabled?: boolean,
  onBlur?: ?(FocusEvent) => void,
  onFocus?: ?(FocusEvent) => void,
  onFocusChange?: ?(boolean) => void,
  onFocusVisibleChange?: ?(boolean) => void,
};

type UseFocusWithinOptions = {
  disabled?: boolean,
  onAfterBlurWithin?: FocusEvent => void,
  onBeforeBlurWithin?: FocusEvent => void,
  onBlurWithin?: FocusEvent => void,
  onFocusWithin?: FocusEvent => void,
  onFocusWithinChange?: boolean => void,
  onFocusWithinVisibleChange?: boolean => void,
};

const isMac =
  typeof window !== 'undefined' && window.navigator != null
    ? /^Mac/.test(window.navigator.platform)
    : false;

const canUseDOM: boolean = !!(
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined'
);

let passiveBrowserEventsSupported = false;

// Check if browser support events with passive listeners
// https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#Safely_detecting_option_support
if (canUseDOM) {
  try {
    const options = {};
    // $FlowFixMe: Ignore Flow complaining about needing a value
    Object.defineProperty(options, 'passive', {
      get: function() {
        passiveBrowserEventsSupported = true;
      },
    });
    window.addEventListener('test', options, options);
    window.removeEventListener('test', options, options);
  } catch (e) {
    passiveBrowserEventsSupported = false;
  }
}

const hasPointerEvents =
  typeof window !== 'undefined' && window.PointerEvent != null;

const globalFocusVisibleEvents = hasPointerEvents
  ? ['keydown', 'pointermove', 'pointerdown', 'pointerup']
  : [
      'keydown',
      'mousedown',
      'mousemove',
      'mouseup',
      'touchmove',
      'touchstart',
      'touchend',
    ];

const passiveObject = {passive: true};
const passiveObjectWithPriority = {passive: true, priority: 0};

// Global state for tracking focus visible and emulation of mouse
let isGlobalFocusVisible = true;
let hasTrackedGlobalFocusVisible = false;

function trackGlobalFocusVisible() {
  globalFocusVisibleEvents.forEach(type => {
    window.addEventListener(
      type,
      handleGlobalFocusVisibleEvent,
      passiveBrowserEventsSupported ? {capture: true, passive: true} : true,
    );
  });
}

function isValidKey(nativeEvent: KeyboardEvent): boolean {
  const {metaKey, altKey, ctrlKey} = nativeEvent;
  return !(metaKey || (!isMac && altKey) || ctrlKey);
}

function isTextInput(nativeEvent: KeyboardEvent): boolean {
  const {key, target} = nativeEvent;
  if (key === 'Tab' || key === 'Esacpe') {
    return false;
  }
  const {isContentEditable, tagName} = (target: any);
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || isContentEditable;
}

function handleGlobalFocusVisibleEvent(
  nativeEvent: MouseEvent | TouchEvent | KeyboardEvent,
): void {
  if (nativeEvent.type === 'keydown') {
    if (isValidKey(((nativeEvent: any): KeyboardEvent))) {
      isGlobalFocusVisible = true;
    }
  } else {
    const nodeName = (nativeEvent.target: any).nodeName;
    // Safari calls mousemove/pointermove when you tab out of the active
    // Safari frame.
    if (nodeName === 'HTML') {
      return;
    }
    // Handle all the other mouse/touch/pointer events
    isGlobalFocusVisible = false;
  }
}

function handleFocusVisibleTargetEvents(
  event: SyntheticEvent<EventTarget>,
  callback,
): void {
  if (event.type === 'keydown') {
    const {nativeEvent} = (event: any);
    if (isValidKey(nativeEvent) && !isTextInput(nativeEvent)) {
      callback(true);
    }
  } else {
    callback(false);
  }
}

function isRelatedTargetWithin(
  focusWithinTarget: Object,
  relatedTarget: null | EventTarget,
): boolean {
  if (relatedTarget == null) {
    return false;
  }
  // As the focusWithinTarget can be a Scope Instance (experimental API),
  // we need to use the containsNode() method. Otherwise, focusWithinTarget
  // must be a Node, which means we can use the contains() method.
  return typeof focusWithinTarget.containsNode === 'function'
    ? focusWithinTarget.containsNode(relatedTarget)
    : focusWithinTarget.contains(relatedTarget);
}

function setFocusVisibleListeners(
  focusVisibleHandles,
  focusTarget: EventTarget,
  callback,
) {
  focusVisibleHandles.forEach(focusVisibleHandle => {
    focusVisibleHandle.setListener(focusTarget, event =>
      handleFocusVisibleTargetEvents(event, callback),
    );
  });
}

function useFocusVisibleInputHandles() {
  return [
    useEvent('mousedown', passiveObject),
    useEvent(hasPointerEvents ? 'pointerdown' : 'touchstart', passiveObject),
    useEvent('keydown', passiveObject),
  ];
}

function useFocusLifecycles() {
  useEffect(() => {
    if (!hasTrackedGlobalFocusVisible) {
      hasTrackedGlobalFocusVisible = true;
      trackGlobalFocusVisible();
    }
  }, []);
}

export function useFocus(
  focusTargetRef: {current: null | Node},
  {
    disabled,
    onBlur,
    onFocus,
    onFocusChange,
    onFocusVisibleChange,
  }: UseFocusOptions,
): void {
  // Setup controlled state for this useFocus hook
  const stateRef = useRef<null | {isFocused: boolean, isFocusVisible: boolean}>(
    {isFocused: false, isFocusVisible: false},
  );
  const focusHandle = useEvent('focusin', passiveObjectWithPriority);
  const blurHandle = useEvent('focusout', passiveObjectWithPriority);
  const focusVisibleHandles = useFocusVisibleInputHandles();

  useLayoutEffect(() => {
    const focusTarget = focusTargetRef.current;
    const state = stateRef.current;

    if (focusTarget !== null && state !== null && focusTarget.nodeType === 1) {
      // Handle focus visible
      setFocusVisibleListeners(
        focusVisibleHandles,
        focusTarget,
        isFocusVisible => {
          if (state.isFocused && state.isFocusVisible !== isFocusVisible) {
            state.isFocusVisible = isFocusVisible;
            if (onFocusVisibleChange) {
              onFocusVisibleChange(isFocusVisible);
            }
          }
        },
      );

      // Handle focus
      focusHandle.setListener(focusTarget, (event: FocusEvent) => {
        if (disabled === true) {
          return;
        }
        if (!state.isFocused && focusTarget === event.target) {
          state.isFocused = true;
          state.isFocusVisible = isGlobalFocusVisible;
          if (onFocus) {
            onFocus(event);
          }
          if (onFocusChange) {
            onFocusChange(true);
          }
          if (state.isFocusVisible && onFocusVisibleChange) {
            onFocusVisibleChange(true);
          }
        }
      });

      // Handle blur
      blurHandle.setListener(focusTarget, (event: FocusEvent) => {
        if (disabled === true) {
          return;
        }
        if (state.isFocused) {
          state.isFocused = false;
          state.isFocusVisible = isGlobalFocusVisible;
          if (onBlur) {
            onBlur(event);
          }
          if (onFocusChange) {
            onFocusChange(false);
          }
          if (state.isFocusVisible && onFocusVisibleChange) {
            onFocusVisibleChange(false);
          }
        }
      });
    }
  }, [
    blurHandle,
    disabled,
    focusHandle,
    focusTargetRef,
    focusVisibleHandles,
    onBlur,
    onFocus,
    onFocusChange,
    onFocusVisibleChange,
  ]);

  // Mount/Unmount logic
  useFocusLifecycles();
}

export function useFocusWithin<T>(
  focusWithinTargetRef:
    | {current: null | T}
    | ((focusWithinTarget: null | T) => void),
  {
    disabled,
    onAfterBlurWithin,
    onBeforeBlurWithin,
    onBlurWithin,
    onFocusWithin,
    onFocusWithinChange,
    onFocusWithinVisibleChange,
  }: UseFocusWithinOptions,
): (focusWithinTarget: null | T) => void {
  // Setup controlled state for this useFocus hook
  const stateRef = useRef<null | {isFocused: boolean, isFocusVisible: boolean}>(
    {isFocused: false, isFocusVisible: false},
  );
  const focusHandle = useEvent('focusin', passiveObjectWithPriority);
  const blurHandle = useEvent('focusout', passiveObjectWithPriority);
  const afterBlurHandle = useEvent('afterblur', passiveObject);
  const beforeBlurHandle = useEvent('beforeblur', passiveObject);
  const focusVisibleHandles = useFocusVisibleInputHandles();

  const useFocusWithinRef = useCallback(
    (focusWithinTarget: null | T) => {
      // Handle the incoming focusTargetRef. It can be either a function ref
      // or an object ref.
      if (typeof focusWithinTargetRef === 'function') {
        focusWithinTargetRef(focusWithinTarget);
      } else {
        focusWithinTargetRef.current = focusWithinTarget;
      }
      const state = stateRef.current;

      if (focusWithinTarget !== null && state !== null) {
        // Handle focus visible
        setFocusVisibleListeners(
          focusVisibleHandles,
          // $FlowFixMe focusWithinTarget is not null here
          focusWithinTarget,
          isFocusVisible => {
            if (state.isFocused && state.isFocusVisible !== isFocusVisible) {
              state.isFocusVisible = isFocusVisible;
              if (onFocusWithinVisibleChange) {
                onFocusWithinVisibleChange(isFocusVisible);
              }
            }
          },
        );

        // Handle focus
        // $FlowFixMe focusWithinTarget is not null here
        focusHandle.setListener(focusWithinTarget, (event: FocusEvent) => {
          if (disabled) {
            return;
          }
          if (!state.isFocused) {
            state.isFocused = true;
            state.isFocusVisible = isGlobalFocusVisible;
            if (onFocusWithinChange) {
              onFocusWithinChange(true);
            }
            if (state.isFocusVisible && onFocusWithinVisibleChange) {
              onFocusWithinVisibleChange(true);
            }
          }
          if (!state.isFocusVisible && isGlobalFocusVisible) {
            state.isFocusVisible = isGlobalFocusVisible;
            if (onFocusWithinVisibleChange) {
              onFocusWithinVisibleChange(true);
            }
          }
          if (onFocusWithin) {
            onFocusWithin(event);
          }
        });

        // Handle blur
        // $FlowFixMe focusWithinTarget is not null here
        blurHandle.setListener(focusWithinTarget, (event: FocusEvent) => {
          if (disabled) {
            return;
          }
          const {relatedTarget} = (event.nativeEvent: any);

          if (
            state.isFocused &&
            !isRelatedTargetWithin(focusWithinTarget, relatedTarget)
          ) {
            state.isFocused = false;
            if (onFocusWithinChange) {
              onFocusWithinChange(false);
            }
            if (state.isFocusVisible && onFocusWithinVisibleChange) {
              onFocusWithinVisibleChange(false);
            }
            if (onBlurWithin) {
              onBlurWithin(event);
            }
          }
        });

        // Handle before blur. This is a special
        // React provided event.
        // $FlowFixMe focusWithinTarget is not null here
        beforeBlurHandle.setListener(focusWithinTarget, (event: FocusEvent) => {
          if (disabled) {
            return;
          }
          if (onBeforeBlurWithin) {
            onBeforeBlurWithin(event);
            // Add an "afterblur" listener on document. This is a special
            // React provided event.
            afterBlurHandle.setListener(
              document,
              (afterBlurEvent: FocusEvent) => {
                if (onAfterBlurWithin) {
                  onAfterBlurWithin(afterBlurEvent);
                }
                // Clear listener on document
                afterBlurHandle.setListener(document, null);
              },
            );
          }
        });
      }
    },
    [
      afterBlurHandle,
      beforeBlurHandle,
      blurHandle,
      disabled,
      focusHandle,
      focusWithinTargetRef,
      onAfterBlurWithin,
      onBeforeBlurWithin,
      onBlurWithin,
      onFocusWithin,
      onFocusWithinChange,
      onFocusWithinVisibleChange,
    ],
  );

  // Mount/Unmount logic
  useFocusLifecycles();

  return useFocusWithinRef;
}
