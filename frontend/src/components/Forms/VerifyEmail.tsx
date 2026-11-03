import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../Auth/useAuth';
import { AuthAPI } from 'src/apis/AuthAPI';
import styled from 'styled-components';
import PageRuler from '../shared/PageRuler';
import {
    ANVIL_URL,
    AnvilImage,
    ButtonRow,
    CardInner,
    Divider,
    FieldInput,
    FieldLabel,
    FieldRow,
    FieldsContainer,
    FormCard,
    PageBackground,
    RULER_URL,
    StartMakingBtn,
    Title,
} from './Login';

const Description = styled.p`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: 15px;
    color: #000;
    text-align: center;
    margin: 16px 20px 0;
`;

const Message = styled.p<{ $type: 'error' | 'success' }>`
    font-family: var(--font-display, 'Funnel Display', sans-serif);
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    margin: 12px 20px 0;
    color: ${p => (p.$type === 'error' ? '#a51c1c' : '#1d7a48')};
`;

const WideBtn = styled(StartMakingBtn)`
    width: auto;
    min-width: clamp(130px, 13vw, 181px);
    padding: 0 16px;

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
`;

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <PageBackground>
        <AnvilImage src={ANVIL_URL} alt="" />
        <PageRuler src={RULER_URL} side="left" zIndex={1} />
        <FormCard>
            <CardInner>{children}</CardInner>
        </FormCard>
    </PageBackground>
);

export default function VerifyEmail() {
    const { token } = useParams<{ token: string }>();
    const { isAuthenticated, setUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    const [isLoading, setIsLoading] = useState(Boolean(token));
    const [isTokenValid, setIsTokenValid] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login', { state: { from: location } });
        }
    }, [isAuthenticated, navigate, location]);


    useEffect(() => {
        if (!isAuthenticated) return;

        if (!token) {
            setError('No verification token found');
            setIsLoading(false);
            return;
        }

        const validateToken = async () => {
            try {
                const result = await AuthAPI.checkEmailToken(token);
                if (!result.success) {
                    setError('This email verification link is invalid or has expired.');
                    return;
                }
                setIsTokenValid(true);
            } catch (err: any) {
                setError(err?.detail || err?.message || 'Unable to validate the email verification link.');
            } finally {
                setIsLoading(false);
            }
        };

        validateToken();
    }, [isAuthenticated, token]);

    const handleVerifyEmail = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (!token) {
            setError('No verification token found');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const result = await AuthAPI.verifyEmail(token);

            if (result.success) {
                // Update the users new permission
                const userResponse = await AuthAPI.me();
                if (userResponse.status == 200) {
                    setUser(userResponse.data);
                    localStorage.setItem('user', JSON.stringify(userResponse.data));
                }
                setSuccess(true);
                setTimeout(() => {
                    navigate('/myforge');
                }, 2000);
            } else {
                setError('Email verification failed.');
            }
        } catch (err: any) {
            console.error('Error verifying email:', err);
            setError(err.message || 'An error occurred while verifying your email.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAuthenticated) {
        return <div>Redirecting to login...</div>;
    }

    if (isLoading) {
        return (
            <Shell>
                <Title>Verify Your Email</Title>
                <Divider />
                <Description>Checking verification link...</Description>
                <div style={{ height: 20 }} />
            </Shell>
        );
    }

    return (
        <Shell>
            <form onSubmit={handleVerifyEmail} style={{ width: '100%', display: 'contents' }}>
                <Title>Verify Your Email</Title>
                <Divider />
                <Description>Click the button below to verify your email address</Description>
                {error && <Message $type="error">{error}</Message>}
                {success && <Message $type="success">Email verified successfully</Message>}
                {isTokenValid && (
                    <ButtonRow style={{ marginTop: 12 }}>
                        <WideBtn type="submit" disabled={success}>
                            {success ? 'Verified!' : 'Verify Email'}
                        </WideBtn>
                    </ButtonRow>
                )}
                {!isTokenValid && <div style={{ height: 20 }} />}
            </form>
        </Shell>
    );
}
