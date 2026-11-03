import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

export default function ResetPassword() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [rcsid, setRcsid] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(Boolean(token));
    const [isTokenValid, setIsTokenValid] = useState(!token);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) return;

        const validateToken = async () => {
            try {
                const result = await AuthAPI.checkPasswordToken(token);
                if (!result.success) {
                    alert('This password reset link is invalid or has expired.');
                    navigate('/reset-password');
                    return;
                }
                setIsTokenValid(true);
            } catch (err: any) {
                alert('This password reset link is invalid or has expired.');
                navigate('/reset-password');
            } finally {
                setIsLoading(false);
            }
        };

        validateToken();
    }, [token, navigate]);

    const handleResetRequest = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            if (!token) {
                const result = await AuthAPI.makePasswordToken({
                    token_type: 'password_reset',
                    rcsid: rcsid,
                });
                if (result.success) {
                    alert('A password reset email has been sent to your RPI email. (It may be in spam)');
                    navigate('/login');
                } else {
                    setError('Unable to send a password reset email for that RCSID.');
                }
                return;
            }

            if (password !== confirmPassword) {
                setError('Passwords do not match');
                return;
            }
            if (password.length < 5) {
                setError('Password must be at least 5 characters');
                return;
            }

            const result = await AuthAPI.resetPassword(token, {
                rcsid: rcsid,
                new_password: password,
            });
            if (result.success) {
                setSuccess(true);
                setTimeout(() => navigate('/login'), 2000);
            } else {
                setError('Password reset failed. Check your RCSID and try again.');
            }
        } catch (err: any) {
            setError(err?.detail || err?.message || 'An error occurred while resetting your password.');
        } finally {
            setIsLoading(false);
        }
    };

    const isRequestForm = !token;

    return (
        <Shell>
            <form onSubmit={handleResetRequest} style={{ width: '100%', display: 'contents' }}>
                <Title>{isRequestForm ? 'Reset Your Password' : 'Choose a New Password'}</Title>
                <Divider />
                <Description>
                    {isRequestForm
                        ? 'Enter your RCS ID and we will send you a password reset link.'
                        : 'Enter your RCS ID and choose a new password for your Forge account.'}
                </Description>

                {error && <Message $type="error">{error}</Message>}
                {success && (
                    <Message $type="success">
                        {isRequestForm
                            ? 'Check your RPI email for a password reset link.'
                            : 'Password reset successfully'}
                    </Message>
                )}

                {(!token || isTokenValid) && !success && (
                    <>
                        <FieldsContainer>
                            <FieldRow>
                                <FieldLabel htmlFor="reset-rcsid">RCS ID</FieldLabel>
                                <FieldInput
                                    id="reset-rcsid"
                                    type="text"
                                    value={rcsid}
                                    onChange={(event) => setRcsid(event.target.value)}
                                    required
                                    autoComplete="username"
                                />
                            </FieldRow>
                            {!isRequestForm && (
                                <>
                                    <FieldRow>
                                        <FieldLabel htmlFor="reset-password">New Password</FieldLabel>
                                        <FieldInput
                                            id="reset-password"
                                            type="password"
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            required
                                            autoComplete="new-password"
                                        />
                                    </FieldRow>
                                    <FieldRow>
                                        <FieldLabel htmlFor="reset-confirm">Confirm Password</FieldLabel>
                                        <FieldInput
                                            id="reset-confirm"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            required
                                            autoComplete="new-password"
                                        />
                                    </FieldRow>
                                </>
                            )}
                        </FieldsContainer>
                        <ButtonRow>
                            <WideBtn type="submit" disabled={isLoading}>
                                {isLoading ? 'Please wait...' : isRequestForm ? 'Send Reset Link' : 'Reset Password'}
                            </WideBtn>
                        </ButtonRow>
                    </>
                )}

                {token && !isLoading && !isTokenValid && !success && (
                    <ButtonRow>
                        <WideBtn type="button" onClick={() => navigate('/reset-password')}>Request a New Link</WideBtn>
                    </ButtonRow>
                )}
            </form>
        </Shell>
    );
}
