'use client';

import {useEffect, useRef, useState} from 'react'
import {cn, configureAssistant, getSubjectColor} from "@/lib/utils";
import {vapi} from "@/lib/vapi.sdk";
import Image from "next/image";
import Lottie, {LottieRefCurrentProps} from "lottie-react";
import soundwaves from '@/constants/soundwaves.json'
import {addToSessionHistory} from "@/lib/actions/companion.actions";

enum CallStatus {
    INACTIVE = 'INACTIVE',
    CONNECTING = 'CONNECTING',
    ACTIVE = 'ACTIVE',
    FINISHED = 'FINISHED',
}

const CompanionComponent = ({ companionId, subject, topic, name, userName, userImage, style, voice }: CompanionComponentProps) => {
    const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [messages, setMessages] = useState<SavedMessage[]>([]);
    const [isInitializing, setIsInitializing] = useState(false);

    const lottieRef = useRef<LottieRefCurrentProps>(null);

    useEffect(() => {
        if(lottieRef) {
            if(isSpeaking) {
                lottieRef.current?.play()
            } else {
                lottieRef.current?.stop()
            }
        }
    }, [isSpeaking, lottieRef])

    useEffect(() => {
        const onCallStart = () => {
            setCallStatus(CallStatus.ACTIVE);
            setIsMuted(false);
        };

        const onCallEnd = () => {
            setCallStatus(CallStatus.FINISHED);
            setIsMuted(false);
            addToSessionHistory(companionId);
        }

        const onMessage = (message: Message) => {
            if(message.type === 'transcript' && message.transcriptType === 'final') {
                const newMessage= { role: message.role, content: message.transcript}
                setMessages((prev) => [newMessage, ...prev])
            }
        }

        const onSpeechStart = () => setIsSpeaking(true);
        const onSpeechEnd = () => setIsSpeaking(false);

        const onError = (error: Error & { errorMsg?: string }) => {
            console.log('Error', error);
            if (error.errorMsg === 'Meeting has ended' || 
                error.errorMsg?.includes('WebSocket') || 
                error.errorMsg?.includes('connection') ||
                error.errorMsg?.includes('ejection')) {
                setCallStatus(CallStatus.FINISHED);
                setIsMuted(false);
                addToSessionHistory(companionId);
                vapi.stop();
            }
        }

        vapi.on('call-start', onCallStart);
        vapi.on('call-end', onCallEnd);
        vapi.on('message', onMessage);
        vapi.on('error', onError);
        vapi.on('speech-start', onSpeechStart);
        vapi.on('speech-end', onSpeechEnd);

        return () => {
            vapi.off('call-start', onCallStart);
            vapi.off('call-end', onCallEnd);
            vapi.off('message', onMessage);
            vapi.off('error', onError);
            vapi.off('speech-start', onSpeechStart);
            vapi.off('speech-end', onSpeechEnd);
        }
    }, [companionId]);

    const initializeDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            if (audioInputs.length === 0) {
                throw new Error('No audio input devices found');
            }
            return true;
        } catch (error) {
            console.error('Failed to initialize devices:', error);
            return false;
        }
    }

    const handleCall = async () => {
        try {
            setIsInitializing(true);
            setCallStatus(CallStatus.CONNECTING);

            const devicesInitialized = await initializeDevices();
            if (!devicesInitialized) {
                throw new Error('Failed to initialize audio devices');
            }

            const assistantOverrides = {
                variableValues: { subject, topic, style },
                clientMessages: undefined,
                serverMessages: undefined,
            }

            await vapi.start(configureAssistant(voice, style), assistantOverrides);
        } catch (error) {
            console.error('Failed to start call:', error);
            setCallStatus(CallStatus.INACTIVE);
        } finally {
            setIsInitializing(false);
        }
    }

    const toggleMicrophone = async () => {
        try {
            if (callStatus !== CallStatus.ACTIVE || isInitializing) return;
            
            const isMuted = vapi.isMuted();
            await vapi.setMuted(!isMuted);
            setIsMuted(!isMuted);
        } catch (error) {
            console.error('Failed to toggle microphone:', error);
            if (callStatus === CallStatus.ACTIVE) {
                setCallStatus(CallStatus.INACTIVE);
                vapi.stop();
            }
        }
    }

    const handleDisconnect = () => {
        setCallStatus(CallStatus.FINISHED)
        vapi.stop()
    }

    return (
        <section className="flex flex-col h-[70vh]">
            <section className="flex gap-8 max-sm:flex-col">
                <div className="companion-section">
                    <div className="companion-avatar" style={{ backgroundColor: getSubjectColor(subject)}}>
                        <div
                            className={
                            cn(
                                'absolute transition-opacity duration-1000', callStatus === CallStatus.FINISHED || callStatus === CallStatus.INACTIVE ? 'opacity-1001' : 'opacity-0', callStatus === CallStatus.CONNECTING && 'opacity-100 animate-pulse'
                            )
                        }>
                            <Image src={`/icons/${subject}.svg`} alt={subject} width={150} height={150} className="max-sm:w-fit" />
                        </div>

                        <div className={cn('absolute transition-opacity duration-1000', callStatus === CallStatus.ACTIVE ? 'opacity-100': 'opacity-0')}>
                            <Lottie
                                lottieRef={lottieRef}
                                animationData={soundwaves}
                                autoplay={false}
                                className="companion-lottie"
                            />
                        </div>
                    </div>
                    <p className="font-bold text-2xl">{name}</p>
                </div>

                <div className="user-section">
                    <div className="user-avatar">
                        <Image src={userImage} alt={userName} width={130} height={130} className="rounded-lg" />
                        <p className="font-bold text-2xl">
                            {userName}
                        </p>
                    </div>
                    <button className="btn-mic" onClick={toggleMicrophone} disabled={callStatus !== CallStatus.ACTIVE}>
                        <Image src={isMuted ? '/icons/mic-off.svg' : '/icons/mic-on.svg'} alt="mic" width={36} height={36} />
                        <p className="max-sm:hidden">
                            {isMuted ? 'Turn on microphone' : 'Turn off microphone'}
                        </p>
                    </button>
                    <button 
                        className={cn(
                            'rounded-lg py-2 cursor-pointer transition-colors w-full text-white',
                            callStatus === CallStatus.ACTIVE ? 'bg-red-700' : 'bg-primary',
                            (callStatus === CallStatus.CONNECTING || isInitializing) && 'animate-pulse'
                        )} 
                        onClick={callStatus === CallStatus.ACTIVE ? handleDisconnect : handleCall}
                        disabled={isInitializing}
                    >
                        {callStatus === CallStatus.ACTIVE
                            ? "End Session"
                            : callStatus === CallStatus.CONNECTING || isInitializing
                                ? 'Initializing...'
                                : 'Start Session'
                        }
                    </button>
                </div>
            </section>

            <section className="transcript">
                <div className="transcript-message no-scrollbar">
                    {messages.map((message, index) => {
                        if(message.role === 'assistant') {
                            return (
                                <p key={index} className="max-sm:text-sm">
                                    {
                                        name
                                            .split(' ')[0]
                                            .replace(/[.,]/g, ',')
                                    }: {message.content}
                                </p>
                            )
                        } else {
                           return <p key={index} className="text-primary max-sm:text-sm">
                                {userName}: {message.content}
                            </p>
                        }
                    })}
                </div>

                <div className="transcript-fade" />
            </section>
        </section>
    )
}

export default CompanionComponent